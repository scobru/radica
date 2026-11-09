//! Voice notes and audio attachments, played in the app. A clip is decoded to PCM (MP3, AAC/M4A, WAV, FLAC, Ogg
//! Vorbis, and Opus in WebM or Ogg, which is what the web records voice notes in) and played with rodio on a thread of
//! its own, one clip at a time.

use std::path::PathBuf;
use std::sync::{Arc, Mutex, mpsc};
use std::time::Duration;

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{CODEC_TYPE_NULL, CODEC_TYPE_OPUS, DecoderOptions};
use symphonia::core::errors::Error;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

/// Decoded audio: interleaved 16-bit samples.
#[derive(Debug)]
pub struct Pcm {
    pub rate: u32,
    pub channels: u16,
    pub samples: Vec<i16>,
}

impl Pcm {
    pub fn seconds(&self) -> f32 {
        self.samples.len() as f32 / (self.rate.max(1) as f32 * self.channels.max(1) as f32)
    }
}

/// Opus has no decoder in symphonia: packets go to opuscule, from the track's `OpusHead` (RFC 7845 §5.1).
struct Opus {
    decoder: opuscule::Decoder,
    channels: usize,
    skip: usize,
    buf: Vec<f32>,
}

impl Opus {
    fn new(head: &[u8]) -> Result<Self, String> {
        if head.len() < 19 || &head[..8] != b"OpusHead" {
            return Err("Opus track without its OpusHead".into());
        }
        let channels = head[9] as usize;
        if !(1..=2).contains(&channels) {
            return Err(format!("Opus with {channels} channels is not supported"));
        }
        let layout = if channels == 1 {
            opuscule::Channels::Mono
        } else {
            opuscule::Channels::Stereo
        };
        Ok(Opus {
            decoder: opuscule::Decoder::new(opuscule::SampleRate::Hz48000, layout),
            channels,
            skip: u16::from_le_bytes([head[10], head[11]]) as usize,
            buf: vec![0.0; 5760 * channels], // 120 ms, the longest packet
        })
    }

    fn decode(&mut self, packet: &[u8], out: &mut Vec<i16>) -> Result<(), String> {
        let frames = match self.decoder.decode(Some(packet), &mut self.buf, false) {
            Ok(n) => n,
            Err(opuscule::Error::InvalidPacket) => return Ok(()), // a damaged packet is skipped
            Err(e) => return Err(format!("Opus: {e}")),
        };
        let start = self.skip.min(frames); // the encoder's pre-skip is not audio
        self.skip -= start;
        out.extend(
            self.buf[start * self.channels..frames * self.channels]
                .iter()
                .map(|s| (s.clamp(-1.0, 1.0) * 32767.0) as i16),
        );
        Ok(())
    }
}

/// Decode the first audio track of a clip.
pub fn decode(bytes: Vec<u8>) -> Result<Pcm, String> {
    let fail = |e: Error| format!("Cannot play this audio: {e}");
    let stream = MediaSourceStream::new(Box::new(std::io::Cursor::new(bytes)), Default::default());
    let mut format = symphonia::default::get_probe()
        .format(
            &Hint::new(),
            stream,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(fail)?
        .format;
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or("No audio in this file")?;
    let (id, params) = (track.id, track.codec_params.clone());
    let mut pcm = Pcm {
        rate: params.sample_rate.unwrap_or(48_000),
        channels: params.channels.map_or(0, |c| c.count() as u16),
        samples: Vec::new(),
    };
    let mut opus = None;
    let mut other = None;
    if params.codec == CODEC_TYPE_OPUS {
        let o = Opus::new(params.extra_data.as_deref().unwrap_or_default())?;
        (pcm.rate, pcm.channels) = (48_000, o.channels as u16);
        opus = Some(o);
    } else {
        other = Some(
            symphonia::default::get_codecs()
                .make(&params, &DecoderOptions::default())
                .map_err(fail)?,
        );
    }
    let mut buffer: Option<SampleBuffer<i16>> = None;
    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(Error::IoError(e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(Error::ResetRequired) => break,
            Err(e) => return Err(fail(e)),
        };
        if packet.track_id() != id {
            continue;
        }
        if let Some(o) = &mut opus {
            o.decode(&packet.data, &mut pcm.samples)?;
        } else if let Some(d) = &mut other {
            match d.decode(&packet) {
                Ok(audio) => {
                    let spec = *audio.spec();
                    (pcm.rate, pcm.channels) = (spec.rate, spec.channels.count() as u16);
                    let needed = audio.capacity() * spec.channels.count();
                    if buffer.as_ref().is_none_or(|b| b.capacity() < needed) {
                        buffer = Some(SampleBuffer::new(audio.capacity() as u64, spec));
                    }
                    let b = buffer.as_mut().expect("set above");
                    b.copy_interleaved_ref(audio);
                    pcm.samples.extend_from_slice(b.samples());
                }
                Err(Error::DecodeError(_)) => {} // a damaged packet is skipped
                Err(e) => return Err(fail(e)),
            }
        }
    }
    if pcm.samples.is_empty() || pcm.channels == 0 {
        return Err("No audio decoded".into());
    }
    Ok(pcm)
}

/// What the player is doing, read by the UI on each frame.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Status {
    /// The attachment (by hash) loaded in the player.
    pub hash: Option<String>,
    pub playing: bool,
    pub position: f32,
    pub duration: f32,
    pub error: Option<String>,
}

enum Cmd {
    Play(String, PathBuf),
    Toggle,
}

/// One clip at a time, on a thread of its own (the audio output must stay on the thread that opened it).
pub struct Player {
    tx: mpsc::Sender<Cmd>,
    pub status: Arc<Mutex<Status>>,
}

impl Player {
    /// `wake` redraws the window while a clip plays, so its time moves.
    pub fn new(wake: Option<rune::Waker>) -> Self {
        let (tx, rx) = mpsc::channel();
        let status = Arc::new(Mutex::new(Status::default()));
        let shared = status.clone();
        std::thread::spawn(move || run(rx, shared, wake));
        Player { tx, status }
    }

    /// Play the attachment `hash` from `path`; the one already loaded pauses or resumes instead.
    pub fn toggle(&self, hash: &str, path: PathBuf) {
        let loaded = self
            .status
            .lock()
            .is_ok_and(|s| s.hash.as_deref() == Some(hash));
        let _ = self.tx.send(if loaded {
            Cmd::Toggle
        } else {
            Cmd::Play(hash.to_owned(), path)
        });
    }

    pub fn status(&self) -> Status {
        self.status.lock().map(|s| s.clone()).unwrap_or_default()
    }
}

fn run(rx: mpsc::Receiver<Cmd>, status: Arc<Mutex<Status>>, wake: Option<rune::Waker>) {
    let set = |f: &dyn Fn(&mut Status)| {
        if let Ok(mut s) = status.lock() {
            f(&mut s);
        }
    };
    let output = rodio::OutputStream::try_default();
    let mut sink: Option<rodio::Sink> = None;
    loop {
        let cmd = rx.recv_timeout(Duration::from_millis(250));
        if let Err(mpsc::RecvTimeoutError::Disconnected) = cmd {
            return;
        }
        match cmd {
            Ok(Cmd::Play(hash, path)) => {
                sink = None;
                let started = (|| {
                    let (_, handle) = output
                        .as_ref()
                        .map_err(|e| format!("No audio output: {e}"))?;
                    let pcm = decode(std::fs::read(&path).map_err(|e| e.to_string())?)?;
                    let s = rodio::Sink::try_new(handle).map_err(|e| e.to_string())?;
                    let duration = pcm.seconds();
                    s.append(rodio::buffer::SamplesBuffer::new(
                        pcm.channels,
                        pcm.rate,
                        pcm.samples,
                    ));
                    Ok::<_, String>((s, duration))
                })();
                match started {
                    Ok((s, duration)) => {
                        sink = Some(s);
                        set(&|st| {
                            *st = Status {
                                hash: Some(hash.clone()),
                                playing: true,
                                position: 0.0,
                                duration,
                                error: None,
                            }
                        });
                    }
                    Err(e) => set(&|st| {
                        *st = Status {
                            hash: Some(hash.clone()),
                            error: Some(e.clone()),
                            ..Default::default()
                        }
                    }),
                }
            }
            Ok(Cmd::Toggle) => match &sink {
                Some(s) if s.is_paused() => s.play(),
                Some(s) => s.pause(),
                None => {}
            },
            Err(_) => {}
        }
        if let Some(s) = &sink {
            let (playing, position, done) = (
                !s.is_paused() && !s.empty(),
                s.get_pos().as_secs_f32(),
                s.empty(),
            );
            set(&|st| {
                st.playing = playing && !done;
                st.position = if done { 0.0 } else { position };
            });
            if done {
                sink = None;
            }
            if let Some(w) = &wake {
                w();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A 16-bit mono WAV of `n` samples at 8 kHz.
    fn wav(n: usize) -> Vec<u8> {
        let data = (n * 2) as u32;
        let mut v = Vec::new();
        for part in [
            &b"RIFF"[..],
            &(36 + data).to_le_bytes(),
            b"WAVEfmt ",
            &16u32.to_le_bytes(),
            &1u16.to_le_bytes(),
            &1u16.to_le_bytes(),
            &8000u32.to_le_bytes(),
            &16000u32.to_le_bytes(),
            &2u16.to_le_bytes(),
            &16u16.to_le_bytes(),
            b"data",
            &data.to_le_bytes(),
        ] {
            v.extend_from_slice(part);
        }
        v.extend((0..n).flat_map(|i| ((i as i16).wrapping_mul(97)).to_le_bytes()));
        v
    }

    #[test]
    fn a_wav_decodes_to_its_samples_and_length() {
        let pcm = decode(wav(8000)).unwrap();
        assert_eq!((pcm.rate, pcm.channels, pcm.samples.len()), (8000, 1, 8000));
        assert!((pcm.seconds() - 1.0).abs() < 0.01);
    }

    #[test]
    fn what_is_not_audio_says_so() {
        assert!(decode(b"definitely not audio".to_vec()).is_err());
        assert!(Opus::new(b"OpusHeadX").is_err());
    }
}

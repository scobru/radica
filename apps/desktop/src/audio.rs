//! Native microphone capture for Radica Desktop, bridged to the sandboxed webview via `window.__radicaNative`.
//! Captures on a dedicated worker thread (`cpal::Stream` is `!Send` on Windows WASAPI), resamples to 16 kHz mono WAV,
//! and emits live meter ticks + final base64 audio payload back through the event loop.

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleFormat;
use serde_json::{json, Value};

pub const TARGET_SAMPLE_RATE: u32 = 16_000;

#[derive(Clone, Debug)]
pub enum VoiceEvent {
    Started,
    Tick {
        elapsed_sec: f64,
        level: u8,
        approx_bytes: usize,
        max_sec: u32,
    },
    Done {
        mime: &'static str,
        base64: String,
        duration_sec: f64,
    },
    Cancelled,
    Error(String),
}

impl VoiceEvent {
    pub fn to_json(&self) -> Value {
        match self {
            VoiceEvent::Started => json!({
                "type": "radica_native_voice",
                "event": "started"
            }),
            VoiceEvent::Tick {
                elapsed_sec,
                level,
                approx_bytes,
                max_sec,
            } => json!({
                "type": "radica_native_voice",
                "event": "tick",
                "elapsedSec": elapsed_sec,
                "level": level,
                "approxBytes": approx_bytes,
                "maxSec": max_sec,
            }),
            VoiceEvent::Done {
                mime,
                base64,
                duration_sec,
            } => json!({
                "type": "radica_native_voice",
                "event": "done",
                "mime": mime,
                "base64": base64,
                "durationSec": duration_sec,
            }),
            VoiceEvent::Cancelled => json!({
                "type": "radica_native_voice",
                "event": "cancelled"
            }),
            VoiceEvent::Error(msg) => json!({
                "type": "radica_native_voice",
                "event": "error",
                "message": msg,
            }),
        }
    }
}

enum RecCmd {
    Stop,
    Cancel,
}

pub struct NativeVoiceController {
    active: Mutex<Option<mpsc::Sender<RecCmd>>>,
}

impl Default for NativeVoiceController {
    fn default() -> Self {
        Self::new()
    }
}

impl NativeVoiceController {
    pub fn new() -> Self {
        Self {
            active: Mutex::new(None),
        }
    }

    pub fn start<F>(&self, max_sec: u32, emit: F)
    where
        F: Fn(VoiceEvent) + Send + 'static,
    {
        self.cancel();
        let max_sec = max_sec.clamp(1, 60);
        let (tx, rx) = mpsc::channel::<RecCmd>();
        if let Ok(mut guard) = self.active.lock() {
            *guard = Some(tx);
        }

        thread::spawn(move || {
            run_capture_worker(max_sec, rx, emit);
        });
    }

    pub fn stop(&self) {
        if let Ok(mut guard) = self.active.lock() {
            if let Some(tx) = guard.take() {
                let _ = tx.send(RecCmd::Stop);
            }
        }
    }

    pub fn cancel(&self) {
        if let Ok(mut guard) = self.active.lock() {
            if let Some(tx) = guard.take() {
                let _ = tx.send(RecCmd::Cancel);
            }
        }
    }
}

fn push_mono_chunk(
    interleaved: &[f32],
    channels: usize,
    buf: &Arc<Mutex<Vec<f32>>>,
    peak_bits: &Arc<AtomicU32>,
    cap_samples: usize,
) {
    let ch = channels.max(1);
    let mut local_peak = 0.0_f32;
    if let Ok(mut vec) = buf.lock() {
        for frame in interleaved.chunks(ch) {
            if vec.len() >= cap_samples {
                break;
            }
            let sum: f32 = frame.iter().copied().sum();
            let mono = (sum / ch as f32).clamp(-1.0, 1.0);
            let abs = mono.abs();
            if abs > local_peak {
                local_peak = abs;
            }
            vec.push(mono);
        }
    }
    let prev = f32::from_bits(peak_bits.load(Ordering::Relaxed));
    if local_peak > prev {
        peak_bits.store(local_peak.to_bits(), Ordering::Relaxed);
    }
}

fn run_capture_worker<F>(max_sec: u32, rx: mpsc::Receiver<RecCmd>, emit: F)
where
    F: Fn(VoiceEvent) + Send + 'static,
{
    let host = cpal::default_host();
    let Some(device) = host.default_input_device() else {
        emit(VoiceEvent::Error("No microphone input device found.".into()));
        return;
    };
    let supported = match device.default_input_config() {
        Ok(cfg) => cfg,
        Err(e) => {
            emit(VoiceEvent::Error(format!("Microphone config unavailable: {e}")));
            return;
        }
    };

    let sample_format = supported.sample_format();
    let config: cpal::StreamConfig = supported.into();
    let src_rate = config.sample_rate.0.max(8_000);
    let channels = config.channels.max(1) as usize;
    let cap_samples = (max_sec as usize + 1) * src_rate as usize;

    let samples = Arc::new(Mutex::new(Vec::<f32>::with_capacity(src_rate as usize * 4)));
    let peak_bits = Arc::new(AtomicU32::new(0.0_f32.to_bits()));

    let samples_cb = Arc::clone(&samples);
    let peak_cb = Arc::clone(&peak_bits);
    let err_cb = |err| {
        eprintln!("Radica mic stream error: {err}");
    };

    let stream_res = match sample_format {
        SampleFormat::F32 => device.build_input_stream(
            &config,
            move |data: &[f32], _| push_mono_chunk(data, channels, &samples_cb, &peak_cb, cap_samples),
            err_cb,
            None,
        ),
        SampleFormat::I16 => device.build_input_stream(
            &config,
            move |data: &[i16], _| {
                let norm: Vec<f32> = data.iter().map(|&s| s as f32 / 32768.0).collect();
                push_mono_chunk(&norm, channels, &samples_cb, &peak_cb, cap_samples);
            },
            err_cb,
            None,
        ),
        SampleFormat::U16 => device.build_input_stream(
            &config,
            move |data: &[u16], _| {
                let norm: Vec<f32> = data
                    .iter()
                    .map(|&s| (s as f32 - 32768.0) / 32768.0)
                    .collect();
                push_mono_chunk(&norm, channels, &samples_cb, &peak_cb, cap_samples);
            },
            err_cb,
            None,
        ),
        other => {
            emit(VoiceEvent::Error(format!("Unsupported microphone format: {other:?}")));
            return;
        }
    };

    let stream = match stream_res {
        Ok(s) => s,
        Err(e) => {
            emit(VoiceEvent::Error(format!("Could not open microphone: {e}")));
            return;
        }
    };

    if let Err(e) = stream.play() {
        emit(VoiceEvent::Error(format!("Could not start microphone: {e}")));
        return;
    }

    let started_at = Instant::now();
    emit(VoiceEvent::Started);

    loop {
        match rx.recv_timeout(Duration::from_millis(120)) {
            Ok(RecCmd::Cancel) => {
                drop(stream);
                emit(VoiceEvent::Cancelled);
                return;
            }
            Ok(RecCmd::Stop) => {
                break;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                drop(stream);
                emit(VoiceEvent::Cancelled);
                return;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                let elapsed_sec = started_at.elapsed().as_secs_f64();
                let peak = f32::from_bits(peak_bits.swap(0.0_f32.to_bits(), Ordering::Relaxed));
                let scaled = (peak * 3.2).clamp(0.0, 1.0);
                let level = ((scaled * 13.0).round() as u8).saturating_add(2).clamp(2, 15);
                let approx_bytes = (elapsed_sec * 32_000.0) as usize;
                emit(VoiceEvent::Tick {
                    elapsed_sec,
                    level,
                    approx_bytes,
                    max_sec,
                });
                if elapsed_sec >= max_sec as f64 {
                    break;
                }
            }
        }
    }

    drop(stream);
    let duration_sec = (started_at.elapsed().as_secs_f64() * 10.0).round() / 10.0;
    let raw = match samples.lock() {
        Ok(guard) => guard.clone(),
        Err(_) => Vec::new(),
    };
    if raw.is_empty() {
        emit(VoiceEvent::Error("No microphone audio captured.".into()));
        return;
    }
    let pcm16 = downsample_to_mono_16k(&raw, 1, src_rate);
    let wav = encode_wav_mono_16k(&pcm16, TARGET_SAMPLE_RATE);
    let base64 = base64_encode(&wav);
    emit(VoiceEvent::Done {
        mime: "audio/wav",
        base64,
        duration_sec: duration_sec.max(0.5),
    });
}

/// Mix multi-channel interleaved float audio to mono and linearly resample to 16 kHz signed 16-bit PCM.
pub fn downsample_to_mono_16k(interleaved: &[f32], channels: usize, src_rate: u32) -> Vec<i16> {
    let ch = channels.max(1);
    let frames = interleaved.len() / ch;
    if frames == 0 || src_rate == 0 {
        return Vec::new();
    }

    let mono: Vec<f32> = if ch == 1 {
        interleaved.to_vec()
    } else {
        interleaved
            .chunks_exact(ch)
            .map(|f| (f.iter().copied().sum::<f32>() / ch as f32).clamp(-1.0, 1.0))
            .collect()
    };

    let dst_len = ((mono.len() as u64 * TARGET_SAMPLE_RATE as u64) / src_rate as u64).max(1) as usize;
    let mut out = Vec::with_capacity(dst_len);
    for i in 0..dst_len {
        let src_pos = (i as f64) * (src_rate as f64) / (TARGET_SAMPLE_RATE as f64);
        let idx = (src_pos as usize).min(mono.len() - 1);
        let frac = (src_pos - idx as f64) as f32;
        let next = (idx + 1).min(mono.len() - 1);
        let sample = mono[idx] + (mono[next] - mono[idx]) * frac;
        let q = (sample.clamp(-1.0, 1.0) * 32767.0).round() as i16;
        out.push(q);
    }
    out
}

/// Encode mono 16-bit PCM samples as a standard 44-byte RIFF/WAVE file.
pub fn encode_wav_mono_16k(samples: &[i16], sample_rate: u32) -> Vec<u8> {
    let data_bytes = (samples.len() * 2) as u32;
    let riff_size = 36_u32.saturating_add(data_bytes);
    let byte_rate = sample_rate.saturating_mul(2);
    let mut wav = Vec::with_capacity(44 + data_bytes as usize);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&riff_size.to_le_bytes());
    wav.extend_from_slice(b"WAVE");
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16_u32.to_le_bytes()); // PCM subchunk size
    wav.extend_from_slice(&1_u16.to_le_bytes()); // PCM format = 1
    wav.extend_from_slice(&1_u16.to_le_bytes()); // Mono
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&2_u16.to_le_bytes()); // Block align
    wav.extend_from_slice(&16_u16.to_le_bytes()); // Bits per sample
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_bytes.to_le_bytes());
    for &s in samples {
        wav.extend_from_slice(&s.to_le_bytes());
    }
    wav
}

/// Standard RFC 4648 base64 encoding.
pub fn base64_encode(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((triple >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((triple >> 12) & 0x3F) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((triple >> 6) & 0x3F) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(triple & 0x3F) as usize] as char
        } else {
            '='
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resamples_stereo_48k_to_mono_16k() {
        let stereo_48k = vec![0.5_f32; 480 * 2]; // 10ms @ 48 kHz stereo
        let out = downsample_to_mono_16k(&stereo_48k, 2, 48_000);
        assert_eq!(out.len(), 160); // 10ms @ 16 kHz mono
        assert!(out.iter().all(|&s| (s - 16384).abs() <= 2));
    }

    #[test]
    fn encodes_valid_wav_header() {
        let samples = vec![0_i16, 1000, -1000, 32767];
        let wav = encode_wav_mono_16k(&samples, 16_000);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(&wav[12..16], b"fmt ");
        assert_eq!(&wav[36..40], b"data");
        assert_eq!(wav.len(), 44 + 8);
        let data_len = u32::from_le_bytes(wav[40..44].try_into().unwrap());
        assert_eq!(data_len, 8);
    }

    #[test]
    fn base64_matches_rfc4648_vectors() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn voice_event_serializes_clean_json() {
        let ev = VoiceEvent::Done {
            mime: "audio/wav",
            base64: "AQID".into(),
            duration_sec: 2.3,
        };
        let j = ev.to_json();
        assert_eq!(j["type"], "radica_native_voice");
        assert_eq!(j["event"], "done");
        assert_eq!(j["mime"], "audio/wav");
        assert_eq!(j["base64"], "AQID");
        assert_eq!(j["durationSec"], 2.3);
    }
}

//! LAN mesh (see CONTEXT.md and `ui/src/lanMesh.ts`): the page's signed chat packets go out as UDP broadcasts on the
//! local network, and packets from other Radica devices come back to the page, so two devices on one Wi-Fi or hotspot
//! still reach each other when Freenet cannot. The page checks every packet; this only carries bytes.

use std::net::UdpSocket;

pub const PORT: u16 = 47509;
/// One packet, as `lanMesh.ts`'s `MESH_MAX_BYTES`.
pub const MAX_BYTES: usize = 60_000;

pub struct Mesh {
    socket: UdpSocket,
}

impl Mesh {
    /// Listen on the LAN; `on_packet` gets every text packet that arrives. None when the port cannot be had.
    // shortcut: no SO_REUSEADDR (std cannot set it), so a second Radica window on one machine (full app and Messenger)
    // runs without the mesh; add socket2 if both are ever needed at once
    pub fn start(on_packet: impl Fn(String) + Send + 'static) -> Option<Mesh> {
        let socket = UdpSocket::bind(("0.0.0.0", PORT)).ok()?;
        socket.set_broadcast(true).ok()?;
        let rx = socket.try_clone().ok()?;
        std::thread::spawn(move || {
            let mut buf = vec![0u8; 65_535];
            while let Ok((n, _)) = rx.recv_from(&mut buf) {
                if n <= MAX_BYTES {
                    if let Ok(text) = std::str::from_utf8(&buf[..n]) {
                        on_packet(text.to_owned());
                    }
                }
            }
        });
        Some(Mesh { socket })
    }

    // shortcut: the limited broadcast address leaves by the default route only; send to each interface's subnet
    // broadcast too if a LAN without a default route (no router at all) must work
    pub fn send(&self, json: &str) {
        if json.len() <= MAX_BYTES {
            let _ = self.socket.send_to(json.as_bytes(), ("255.255.255.255", PORT));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_packet_on_the_port_reaches_the_page_and_an_oversized_one_does_not() {
        let (tx, rx) = std::sync::mpsc::channel();
        let Some(_mesh) = Mesh::start(move |p| {
            let _ = tx.send(p);
        }) else {
            return; // port taken on this machine: nothing to check
        };
        let out = UdpSocket::bind(("127.0.0.1", 0)).unwrap();
        out.send_to(&vec![b'x'; MAX_BYTES + 1], ("127.0.0.1", PORT)).unwrap();
        out.send_to(b"{\"v\":1}", ("127.0.0.1", PORT)).unwrap();
        let got = rx.recv_timeout(std::time::Duration::from_secs(5)).unwrap();
        assert_eq!(got, "{\"v\":1}");
    }
}

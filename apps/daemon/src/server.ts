import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';

dotenv.config();

const PORT = parseInt(process.env.DAEMON_PORT ?? '4242', 10);

const wss = new WebSocketServer({ port: PORT });

wss.on('listening', () => {
  console.log(`[Dextro Daemon] WebSocket sync server listening on ws://localhost:${PORT}`);
});

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[Daemon] New client connected: ${clientIp}`);

  ws.on('message', (data) => {
    // TODO: Route to Automerge sync protocol handler
    console.log(`[Daemon] Received message`);
  });

  ws.on('close', () => {
    console.log(`[Daemon] Client disconnected: ${clientIp}`);
  });

  ws.on('error', (err) => {
    console.error(`[Daemon] WebSocket error: ${err.message}`);
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Daemon] Shutting down...');
  wss.close(() => process.exit(0));
});

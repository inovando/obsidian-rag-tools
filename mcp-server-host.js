const net = require('net');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 9981;
const server = net.createServer((socket) => {
  console.log('Client connected from sandbox');
  
  const mcp = spawn('node', [path.join(__dirname, 'mcp-server.js')], {
    cwd: __dirname
  });

  socket.pipe(mcp.stdin);
  mcp.stdout.pipe(socket);
  
  mcp.stderr.on('data', (data) => {
    process.stderr.write(data);
  });

  socket.on('close', () => {
    console.log('Client disconnected, killing MCP process');
    mcp.kill();
  });

  mcp.on('close', () => {
    socket.destroy();
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`MCP Host Bridge listening on 127.0.0.1:${PORT}`);
});

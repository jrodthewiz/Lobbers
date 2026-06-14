import net from "node:net";
import { spawn } from "node:child_process";

const SERVER_PORT_START = Number(process.env.LOBBERS_DEV_SERVER_PORT ?? process.env.PORT ?? 2577);
const CLIENT_PORT_START = Number(process.env.LOBBERS_DEV_CLIENT_PORT ?? process.env.VITE_PORT ?? 5183);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const mergeEnv = (extraEnv) => {
  if (process.platform !== "win32") return { ...process.env, ...extraEnv };

  const merged = new Map();
  for (const [key, value] of Object.entries(process.env)) {
    merged.set(key.toUpperCase(), [key, value]);
  }
  for (const [key, value] of Object.entries(extraEnv)) {
    merged.set(key.toUpperCase(), [key, value]);
  }
  return Object.fromEntries([...merged.values()]);
};

const canListen = (port, host) => new Promise((resolve) => {
  const server = net.createServer();
  server.once("error", () => resolve(false));
  server.once("listening", () => {
    server.close(() => resolve(true));
  });
  server.listen(port, host);
});

const isPortAvailable = async (port) => (
  await canListen(port, "0.0.0.0")
  && await canListen(port, "::")
);

const findAvailablePort = async (startPort) => {
  for (let port = startPort; port < startPort + 100; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found from ${startPort} to ${startPort + 99}.`);
};

const prefixStream = (stream, prefix, write) => {
  let buffered = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffered += chunk;
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      write(`[${prefix}] ${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buffered) write(`[${prefix}] ${buffered}\n`);
  });
};

const spawnSide = (name, args, env) => {
  const child = spawn(npmCommand, args, {
    cwd: process.cwd(),
    env: mergeEnv(env),
    shell: process.platform === "win32",
    stdio: ["inherit", "pipe", "pipe"],
  });

  prefixStream(child.stdout, name, (line) => process.stdout.write(line));
  prefixStream(child.stderr, name, (line) => process.stderr.write(line));
  return child;
};

const serverPort = await findAvailablePort(SERVER_PORT_START);
const clientPort = await findAvailablePort(CLIENT_PORT_START);
const serverUrl = `http://localhost:${serverPort}`;

console.log(`[dev] server: ${serverUrl}`);
console.log(`[dev] client: http://localhost:${clientPort}/`);

const children = [
  spawnSide("server", ["run", "dev:server"], {
    PORT: String(serverPort),
    LOBBERS_DEV_SERVER_PORT: String(serverPort),
  }),
  spawnSide("client", ["run", "dev:client", "--", "--port", String(clientPort), "--strictPort"], {
    VITE_SERVER_URL: serverUrl,
    LOBBERS_DEV_SERVER_PORT: String(serverPort),
    LOBBERS_DEV_CLIENT_PORT: String(clientPort),
  }),
];

let shuttingDown = false;
const shutdown = (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exitCode = exitCode;
};

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const exitCode = signal ? 1 : (code ?? 0);
    shutdown(exitCode);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

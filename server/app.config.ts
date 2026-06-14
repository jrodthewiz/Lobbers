import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import config from "@colyseus/tools";
import { ROOM_NAME } from "../shared/game/constants";
import { getLobby, listOpenLobbies, normalizeLobbyCode } from "./lobbies";
import { ThrowRoom } from "./rooms/ThrowRoom";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default config({
  options: {
    greet: false,
  },

  initializeGameServer: (gameServer) => {
    gameServer.define(ROOM_NAME, ThrowRoom).filterBy(["code"]);
  },

  initializeExpress: (app) => {
    app.use(express.json({ limit: "1mb" }));
    app.use((req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }
      next();
    });

    app.get("/api/health", (_req, res) => {
      res.json({ ok: true, service: "lobbers" });
    });

    app.get("/api/lobbies", (_req, res) => {
      res.json({ lobbies: listOpenLobbies() });
    });

    app.get("/api/lobbies/:code", (req, res) => {
      const code = normalizeLobbyCode(req.params.code);
      const lobby = getLobby(code);
      if (!lobby) {
        res.status(404).json({ exists: false, code });
        return;
      }
      res.json({
        exists: true,
        lobby,
        open: lobby.roundState === "waiting" && lobby.playerCount < lobby.maxPlayers,
      });
    });

    if (process.env.NODE_ENV === "production") {
      const distClientPath = path.resolve(projectRoot, "dist/client");
      app.use(express.static(distClientPath));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distClientPath, "index.html"));
      });
    }
  },
});

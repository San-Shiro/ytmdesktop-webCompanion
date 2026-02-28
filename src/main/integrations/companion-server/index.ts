import IIntegration from "../integration";
import Fastify, { FastifyInstance } from "fastify";
import FastifyIO from "fastify-socket.io/dist/index";
import CompanionServerAPIv1 from "./api/v1";
import { MemoryStoreSchema, StoreSchema } from "~shared/store/schema";
import Conf from "conf";
import { BrowserView, safeStorage } from "electron";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { AuthToken } from "~shared/integrations/companion-server/types";
import { RemoteSocket } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import cors from "@fastify/cors";
import MemoryStore from "../../memory-store";
import log from "electron-log";
import { isDefinedAPIError } from "./api-shared/errors";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { addDashboardSession, isDashboardSession } from "./api-shared/auth";

function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  let fallback: string | null = null;
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      // Skip APIPA/link-local addresses
      if (iface.address.startsWith("169.254.")) continue;
      // Prefer common LAN ranges
      if (iface.address.startsWith("192.168.") || iface.address.startsWith("10.") || iface.address.startsWith("172.")) {
        return iface.address;
      }
      if (!fallback) fallback = iface.address;
    }
  }
  return fallback || "localhost";
}


export default class CompanionServer implements IIntegration {
  private listenIp = "0.0.0.0";
  private get listenPort(): number {
    return this.store?.get("integrations")?.companionServerPort ?? 9863;
  }
  private fastifyServer: FastifyInstance;
  private store: Conf<StoreSchema>;
  private memoryStore: MemoryStore<MemoryStoreSchema>;
  private ytmView: BrowserView;
  private storeListener: () => void | null = null;

  private createServer() {
    this.fastifyServer = Fastify().withTypeProvider<TypeBoxTypeProvider>();
    this.fastifyServer.register(cors, {
      origin: this.store.get<"integrations.companionServerCORSWildcardEnabled", boolean>("integrations.companionServerCORSWildcardEnabled", false) ? "*" : false,
      credentials: true
    });
    this.fastifyServer.register(fastifyCookie);
    this.fastifyServer.register(FastifyIO, {
      transports: ["websocket"],
      allowUpgrades: false,
      // While this is websocket only we still apply cors just in case
      cors: {
        origin: this.store.get<"integrations.companionServerCORSWildcardEnabled", boolean>("integrations.companionServerCORSWildcardEnabled", false)
          ? "*"
          : false,
        credentials: true
      }
    });
    this.fastifyServer.register(CompanionServerAPIv1, {
      prefix: "/api/v1",
      getYtmView: () => {
        return this.ytmView;
      },
      getStore: () => {
        return this.store;
      },
      getMemoryStore: () => {
        return this.memoryStore;
      }
    });
    this.fastifyServer.setErrorHandler((error, request, reply) => {
      if (!isDefinedAPIError(error)) {
        if (!error.statusCode || error.statusCode >= 500) {
          log.error(error);
          reply.send(new Error("An internal server error occurred"));
          return;
        }
      }

      reply.send(error);
    });
    this.fastifyServer.get("/metadata", (request, reply) => {
      const localIp = getLocalIP();
      const port = this.listenPort;
      reply.send({
        apiVersions: ["v1"],
        dashboardUrl: `http://${localIp}:${port}/dashboard`
      });
    });

    // ── Dashboard Routes ─────────────────────────────────────
    const dashboardDir = path.join(__dirname, "dashboard");

    // Serve static dashboard files
    this.fastifyServer.register(fastifyStatic, {
      root: dashboardDir,
      prefix: "/dashboard/",
      decorateReply: false,
      wildcard: false
    });

    // Dashboard index — serves login or dashboard page
    this.fastifyServer.get("/dashboard", (request, reply) => {
      if (!this.store.get("integrations.companionDashboardEnabled")) {
        reply.code(404).send({ error: "Dashboard disabled" });
        return;
      }
      const indexPath = path.join(dashboardDir, "index.html");
      const html = require("node:fs").readFileSync(indexPath, "utf-8");
      reply.type("text/html").send(html);
    });

    // Login endpoint
    this.fastifyServer.post<{ Body: { password: string } }>("/dashboard/login", (request, reply) => {
      if (!this.store.get("integrations.companionDashboardEnabled")) {
        reply.code(404).send({ error: "Dashboard disabled" });
        return;
      }
      const expected = this.store.get("integrations.companionDashboardPassword") || "ytmd";
      if (request.body?.password === expected) {
        const sessionId = crypto.randomUUID();
        addDashboardSession(sessionId);
        reply.setCookie("ytmd_session", sessionId, { path: "/", httpOnly: true, sameSite: "lax" });
        reply.send({ ok: true });
      } else {
        reply.code(401).send({ error: "Wrong password" });
      }
    });

    // Session check endpoint
    this.fastifyServer.get("/dashboard/session", (request, reply) => {
      if (isDashboardSession(request)) {
        reply.send({ ok: true });
      } else {
        reply.code(401).send({ error: "No session" });
      }
    });

    // Local IP endpoint for dashboard
    this.fastifyServer.get("/dashboard/info", (request, reply) => {
      reply.send({
        localIp: getLocalIP(),
        port: this.listenPort,
        dashboardUrl: `http://${getLocalIP()}:${this.listenPort}/dashboard`
      });
    });

    // Disconnect connections to the default namespace
    this.fastifyServer.ready().then(() => {
      this.fastifyServer.io.on("connection", socket => socket.disconnect());
    });
  }

  public provide(store: Conf<StoreSchema>, memoryStore: MemoryStore<MemoryStoreSchema>, ytmView: BrowserView): void {
    this.store = store;
    this.memoryStore = memoryStore;
    this.ytmView = ytmView;
  }

  public async enable() {
    if (!this.memoryStore.get("safeStorageAvailable")) {
      log.info("Refusing to enable Companion Server Integration with reason: safeStorage unavailable");
      return;
    }

    if (!this.fastifyServer || (this.fastifyServer && !this.fastifyServer.server.listening)) {
      this.createServer();
      await this.fastifyServer.listen({
        host: this.listenIp,
        port: this.listenPort
      });
      this.storeListener = this.store.onDidChange("integrations", async newState => {
        const validTokenIds: string[] = newState.companionServerAuthTokens
          ? JSON.parse(safeStorage.decryptString(Buffer.from(newState.companionServerAuthTokens, "hex"))).map((authToken: AuthToken) => authToken.id)
          : [];
        if (this.fastifyServer.server.listening) {
          const namespaces = this.fastifyServer.io._nsps.keys();
          let sockets: RemoteSocket<DefaultEventsMap, { tokenId: string }>[] = [];

          for (const namespace of namespaces) {
            const namespacedSockets = await this.fastifyServer.io.of(namespace).fetchSockets();
            sockets = sockets.concat(namespacedSockets);
          }

          for (const socket of sockets) {
            if (!validTokenIds.includes(socket.data.tokenId)) {
              socket.disconnect(true);
            }
          }
        }
      });
    }
  }

  public async disable() {
    if (this.fastifyServer) {
      await this.fastifyServer.close();
      if (this.storeListener) {
        this.storeListener();
      }
    }
  }

  public getYTMScripts(): { name: string; script: string }[] {
    return [];
  }
}

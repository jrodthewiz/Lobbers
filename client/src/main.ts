import "./styles.css";
import "./club.css";
import "./garage.css";
import "./demolition.css";
import { DemolitionGame } from "./game/DemolitionGame";
import { DemolitionDuel } from "./game/DemolitionDuel";
import { needsStaticBackendNotice, showStaticBackendNotice } from "./staticFrontend";

if (new URLSearchParams(location.search).get("mode") === "duel") {
  new DemolitionDuel().start();
} else if (new URLSearchParams(location.search).get("mode") === "artillery") {
  if (needsStaticBackendNotice("artillery", import.meta.env.VITE_STATIC_FRONTEND, import.meta.env.VITE_SERVER_URL)) {
    showStaticBackendNotice();
  } else {
    void import("./LobbersApp").then(({ LobbersApp }) => new LobbersApp().start());
  }
} else {
  new DemolitionGame().start();
}

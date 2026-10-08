import "./styles.css";
import "./club.css";
import "./garage.css";
import "./demolition.css";
import { DemolitionGame } from "./game/DemolitionGame";
import { DemolitionDuel } from "./game/DemolitionDuel";

if (new URLSearchParams(location.search).get("mode") === "duel") {
  new DemolitionDuel().start();
} else if (new URLSearchParams(location.search).get("mode") === "artillery") {
  void import("./LobbersApp").then(({ LobbersApp }) => new LobbersApp().start());
} else {
  new DemolitionGame().start();
}

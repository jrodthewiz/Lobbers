import "./styles.css";
import "./club.css";
import "./garage.css";
import "./demolition.css";
import { DemolitionGame } from "./game/DemolitionGame";

if (new URLSearchParams(location.search).get("mode") === "artillery") {
  void import("./LobbersApp").then(({ LobbersApp }) => new LobbersApp().start());
} else {
  new DemolitionGame().start();
}

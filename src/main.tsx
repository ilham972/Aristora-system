import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow/latin-700.css";
import "@fontsource/barlow-semi-condensed/latin-600.css";
import "@fontsource/barlow-semi-condensed/latin-700.css";
import "./styles.css";
import { render } from "preact";
import { App } from "./app";
import { startStore } from "./store";

startStore();
render(<App />, document.getElementById("app")!);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { connect } from "./rpc";

const root = document.querySelector("#root");
if (!root) throw new Error("index.html has nowhere to draw");

createRoot(root).render(
    <StrictMode>
        <App bridge={connect()} />
    </StrictMode>,
);

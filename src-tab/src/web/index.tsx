import React from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";
import { WebApp } from "./WebApp";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

createRoot(container).render(
	<React.StrictMode>
		<WebApp />
	</React.StrictMode>,
);

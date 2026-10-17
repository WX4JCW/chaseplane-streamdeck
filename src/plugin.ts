import streamDeck from "@elgato/streamdeck";

import { CameraAction } from "./actions/camera";
import { CinematicAction, FlashlightAction } from "./actions/toggles";
import { chasePlane } from "./chaseplane/client";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new CameraAction());
streamDeck.actions.registerAction(new FlashlightAction());
streamDeck.actions.registerAction(new CinematicAction());

streamDeck.connect();
chasePlane.start();

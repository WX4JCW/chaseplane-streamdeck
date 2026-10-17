import streamDeck from "@elgato/streamdeck";

import { CameraAction } from "./actions/camera";
import { CinematicAction, FlashlightAction } from "./actions/toggles";
import { MyAircraftAction, TrafficPageAction, TrafficSlotAction } from "./actions/traffic";
import { chasePlane } from "./chaseplane/client";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new CameraAction());
streamDeck.actions.registerAction(new FlashlightAction());
streamDeck.actions.registerAction(new CinematicAction());
streamDeck.actions.registerAction(new TrafficSlotAction());
streamDeck.actions.registerAction(new MyAircraftAction());
streamDeck.actions.registerAction(new TrafficPageAction());

streamDeck.connect();
chasePlane.start();

import streamDeck from "@elgato/streamdeck";

import { CameraAction } from "./actions/camera";
import { DeckAction } from "./actions/deck";
import { DeckDialAction } from "./actions/dial";
import { CinematicAction, FlashlightAction } from "./actions/toggles";
import { StatusAction } from "./actions/status";
import { KeyStyleAction } from "./actions/style-switch";
import { SvgTestAction } from "./actions/svg-test";
import { MyAircraftAction, TrafficPageAction, TrafficSlotAction } from "./actions/traffic";
import { chasePlane } from "./chaseplane/client";
import { groupLibrary } from "./chaseplane/groups";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new CameraAction());
streamDeck.actions.registerAction(new FlashlightAction());
streamDeck.actions.registerAction(new CinematicAction());
streamDeck.actions.registerAction(new TrafficSlotAction());
streamDeck.actions.registerAction(new MyAircraftAction());
streamDeck.actions.registerAction(new TrafficPageAction());
streamDeck.actions.registerAction(new SvgTestAction());
streamDeck.actions.registerAction(new DeckAction());
streamDeck.actions.registerAction(new DeckDialAction());
streamDeck.actions.registerAction(new StatusAction());
streamDeck.actions.registerAction(new KeyStyleAction());

streamDeck.connect();
chasePlane.start();
groupLibrary.start();

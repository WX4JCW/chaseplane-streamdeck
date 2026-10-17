// Put the glow icon pairs on the Flight Panel ChasePlane buttons.
// Usage: node apply_glow.js [--dry-run]
// State 0 (not selected) gets SD_<icon>-off.png, state 1 (selected) gets SD_<icon>-on.png.
// Refuses to run while Stream Deck is open; backs up each touched page first.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const DRY = process.argv.includes("--dry-run");
const GLOW = "D:/Bundled Images/StreamDeck Icons/Working Icons/Glow";
const PROFILE = path.join(process.env.APPDATA, "Elgato/StreamDeck/ProfilesV3/493D868E-BBB5-4BA8-ADEF-17D95E4E95D6.sdProfile/Profiles");
const MAPPING = path.join(__dirname, "glow_mapping.json");
const BACKUP = path.join(__dirname, "backup_pre_glow");

if (!DRY && execSync("tasklist").toString().toLowerCase().includes("streamdeck.exe")) {
  console.error("Stream Deck is running. Quit it first.");
  process.exit(1);
}

const mapping = JSON.parse(fs.readFileSync(MAPPING, "utf8"));
const byPage = {};
for (const m of mapping) (byPage[m.page] ||= []).push(m);

for (const [page, items] of Object.entries(byPage)) {
  const dir = path.join(PROFILE, page);
  const file = path.join(dir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  const actions = manifest.Controllers.find(c => c.Type === "Keypad").Actions;

  if (!DRY) fs.cpSync(dir, path.join(BACKUP, page), { recursive: true });

  for (const { pos, icon, folder } of items) {
    const action = actions[pos];
    if (!action || action.States.length !== 2) throw new Error(`${folder} ${pos}: expected a 2-state button`);
    const safe = icon.replace(/[^A-Za-z0-9_]/g, "_");
    ["off", "on"].forEach((state, i) => {
      const rel = `Images/GLOW_${safe}_${state.toUpperCase()}.png`;
      if (!DRY) fs.copyFileSync(path.join(GLOW, `SD_${icon}-${state}.png`), path.join(dir, rel));
      action.States[i].Image = rel;
    });
    console.log(`${DRY ? "would set" : "set"}  ${folder.padEnd(10)} ${pos.padEnd(4)} ${icon}`);
  }
  if (!DRY) fs.writeFileSync(file, JSON.stringify(manifest));
}
console.log(DRY ? "dry run, nothing written" : `done; backup in ${BACKUP}`);

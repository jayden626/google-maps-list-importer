# Google Maps List Importer

Easily bring your saved places and lists from **Google Takeout** back into your **Google Maps account**.

---

## What This Tool Can Do

* **Import Custom Saved Lists:** Imports all your custom Google Maps lists (e.g., *Coffee Spots*, *Want to Go*, *Travel 2024*).
* **Import Starred Places:** Imports your main Google Takeout saved places straight into your Google Maps **Starred Places** list.
* **Import Notes:** If you wrote custom notes on any of your saved locations, the script will automatically re-attach those notes to the place on Google Maps.
* **Smart Deduplication:** Remembers what has already been imported so you can re-run the tool anytime without creating duplicates.

---

## How to Download & Run

You can run this tool in two ways:

### Method A: Direct with `npx` (Recommended / No Cloning Needed)
You don't need to download or clone the repository files. Just open your terminal in the directory where your `lists` folder lives and run:
```bash
npx google-maps-list-importer
```

### Method B: Manual Download / Git

1. Click **Code** $\rightarrow$ **Download ZIP** at the top of this GitHub page (or clone the repository).
2. Unzip the folder and open your terminal inside it.
3. Run `npm install` to set up dependencies.

---

## How to Export & Find Your Data in Google Takeout

When exporting your data from [Google Takeout](https://takeout.google.com), click **Deselect all**, then check these two options:

1. **Saved:**
* Exports your custom lists as `.csv` files (including any saved notes).
* Inside the downloaded archive, look for: `Takeout / Saved /`


2. **Maps (your places):**
* Exports your starred locations as `Saved Places.json`.
* Inside the downloaded archive, look for: `Takeout / Maps (your places) / Saved Places.json`
* **Note:** Importing `Saved Places.json` will save those locations directly into your **Starred Places** list on Google Maps.



---

## Before You Start (One-Time Setup)

1. **Install Node.js & Google Chrome:**
* Make sure you have **Node.js** installed on your computer. Download it from [nodejs.org](https://nodejs.org) if you haven't already.
* Make sure you have the **Google Chrome** desktop browser installed.


2. **Create Your Lists on Google Maps First:**
* Before running the script, every custom list you want to import must already exist in your Google Maps account with the exact same name as your file.
* If you have a file called `Coffee Spots.csv`, you must have a list named **Coffee Spots** created on Google Maps before running.
* *(You do not need to create Starred Places—Google Maps already has that built in).*
* You will need to rename `Favorite places.csv` to `Favorites.csv` (or `Favourites.csv`, depending on your language settings in Google Maps).
* If a list is missing on Google Maps, the script will skip that file and warn you at the end.
* **WARNING:** The script will fail if you have:
* Two lists with the exact same name.
* A list that is a substring of another list's name (e.g., a list named `Cafes` will conflict if you also have a list called `Best Cafes`). Please rename the list and file to something unique, then rename them back after the import.


---

## How to Run the Importer (Step-by-Step)

### Step 1: Launch Chrome in "Connect Mode"

The script needs to interact with your real Chrome browser window. Close any existing open instances of Chrome, then open your terminal and run the command for your operating system:

* **Mac / Linux:**
```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/maps-chrome
```


* **Windows:** (Untested)
```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Google\Chrome\MapsUser"
```



---

### Step 2: Log Into Google Maps & Verify Connection

1. In the Chrome window that just opened, navigate to [google.com/maps](https://google.com/maps) and **log into your Google account**.
2. Keep this Chrome window open.
3. Open a second terminal window in your project directory and run the connection check command:
* **Via npx:** `npx google-maps-list-importer --check`
* **Via local code:** `node script.js --check`


4. If the terminal prints `✓ Connected!`, you are ready to proceed.

---

### Step 3: Put Your Files in the `lists` Folder

1. Create a folder named `lists` in your working project directory.
2. Copy your `.csv` files (from `Takeout/Saved/`) or `Saved Places.json` (from `Takeout/Maps (your places)/`).
3. Drop them straight into the `lists` folder.

---

### Step 4: Run the Importer!

In your terminal window, run:

* **Via npx:**
```bash
npx google-maps-list-importer
```


* **Via local code:**
```bash
node script.js
```



You can leave the script running in the background—it will process your places, save them to your lists, and add your notes automatically.

---

## What Happens When It's Done?

At the end of the run, the script will print a summary:

* **Skipped Places:** Items you imported in past runs are skipped automatically so you don't get duplicates.
* **Missing Lists Warning:** If a list wasn't found on your Google Maps account, the script will tell you which ones were missing. Simply go to Google Maps, create the list with that exact name, and re-run the command.
* **Failed Items:** If any link glitched or failed to load, check the `logs/run_<timestamp>/failures` folder. Open any text files inside to view the links that failed so you can click and save them manually.

---

## Verification & Retrying Missing Places

This tool isn't perfect, and sometimes Google doesn't like to save things when you click save. To verify your results:

1. In another browser or on the Google Maps app, check how many places are saved in each of your lists.
2. If the numbers do not match what you expect from your old account:
* Delete the history file for that list inside the `history/` folder (for example, delete `history/Coffee Spots.txt`), or delete the entire `history/` folder if you want to retry all lists.
* Run the tool again using `npx google-maps-list-importer` or `node script.js`. It will re-attempt every place that wasn't previously skipped.



This process may have to be repeated a few times. Sorry, but it is how it is!

---

## Command Line Options (Advanced)

Developers can customize folder paths and port settings using these optional flags:

| Flag | Short | Default | Description |
| --- | --- | --- | --- |
| `--lists` | `-l` | `./lists` | Folder where your Google Takeout CSV/JSON files are stored |
| `--history` | `-h` | `./history` | Folder maintaining cross-run deduplication logs |
| `--logs` | `-o` | `./logs` | Parent folder for execution and failure logs |
| `--port` | `-p` | `9222` | Chrome DevTools Protocol port |
| `--check` | `-c` | `false` | Runs a quick connectivity check to Chrome and exits |

#### Custom Usage Example:

```bash
npx google-maps-list-importer --lists ./my-takeout-folder --port 9223
```

---

## LLM Usage Disclosure

ChatGPT and Gemini were used to basically vibe-code this whole thing. It was quite frustrating and I learned nothing, but it was an interesting experiment. It solved an issue I've had for a while, and I didn't need to think about it (that's a lie, I had to think a lot to get the AI to do what I wanted.)

It was easy to get started, and took little effort to keep going, but at some point I think I should have just learned how Playwright worked and started writing the code myself.
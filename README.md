# Google Maps List Importer

Easily bring your saved places and lists from **Google Takeout** back into your **Google Maps account**.

---

## What This Tool Can Do

* **Import Custom Saved Lists:** Imports all your custom Google Maps lists (e.g., *Coffee Spots*, *Want to Go*, *Travel 2024*).
* **Import Starred Places:** Imports your main Google Takeout saved places straight into your Google Maps **Starred Places** list.
* **Import Notes:** If you wrote custom notes on any of your saved locations, the script will automatically re-attach those notes to the place on Google Maps.

## How It Works

* This tool will read your `Saved Places.json` and your saved list `.csv` files from **Google Takeout** that you have placed in the `/lists` folder
* It will then use **Google Chrome** in debugging mode to open each place in maps, click the save button, and save it to the list
* After saving, it will add the note if it exists, then move onto the next place

## WARNING

This tool will get full access to your Chrome instance. While you shouldn't trust random tools you find online, I promise I haven't added anything purposely malicious to this code.
The source code is openly available on [GitHub](https://github.com/jayden626/google-maps-list-importer). Please check it out if you're worried.

---

## Getting Started

Please follow these steps before running this tool

### Prerequisites

To run this tool, you must have the following installed:
1. **Node.js**
* Download and install `Node.js` from [nodejs.org](https://nodejs.org) if you haven't already.
* Verify your installation by opening a terminal and running `npx -v`
    * If it prints a version number, you're good to go

2. **Google Chrome**
* This tool will use **Google Chrome** in debugging mode to save each place.
* So you've gotta have Chrome installed.

**Also** you may want to prevent your computer from sleeping.

### Getting Your Saved Maps

Export your data from [Google Takeout](https://takeout.google.com). At the top, click **Deselect all**, then check these two options:

1. **Saved:**
* Exports your custom lists as `.csv` files (including any saved notes, e.g., `Favorite places.csv`, `Want to go.csv`).
* Inside the downloaded archive, look for: `Takeout / Saved /`


2. **Maps (your places):**
* Exports your starred locations as `Saved Places.json`.
* Inside the downloaded archive, look for: `Takeout / Maps (your places) / Saved Places.json`
    * **Note:** By default, the script reads `Saved Places.json` and imports those locations directly into your **Starred Places** list on Google Maps.
    * **If your Google Maps is in another language** (e.g., *Lieux suivis* in French, *Mit Stern versehene Orte* in German) or you want your starred items saved to a different list name entirely, pass `--starred-list "Your List Name"` when running the tool.
    * **If your starred places JSON file has a different name**, pass `--saved-places-file "Your File Name.json"` when running the tool.

### Set Up Your Folders

* Once you have your map data, create a new folder inside the `Takeout` folder called `lists`.
* Place the `Saved Places.json` and the `.csv` files you wish to import inside that folder
    * This tool can process them all in one go, but it might be easier to verify the results if you only import one file at a time


### Create Lists in Google Maps

Before running the script, every custom list you want to import must already exist in your Google Maps account with the exact same name as your file.
* If you have a file called `Coffee Spots.csv`, you must have a list named **Coffee Spots** created on Google Maps before running.
* *(You do not need to create Starred Places—Google Maps already has that built in).*
* You will need to rename `Favorite places.csv` to `Favorites.csv` (or `Favourites.csv`, depending on your language settings in Google Maps).

If a list is missing on Google Maps, the script will skip that file and warn you at the end.

**WARNING:** The script will fail if you have:
* Two lists with the exact same name.
* A list that is a substring of another list's name (e.g., a list named `Cafes` will conflict if you also have a list called `Best Cafes`). Please rename the list and file to something unique, then rename them back after the import.

---

## How to Run the Importer

### Step 1: Launch Chrome in "Connect Mode"

The script needs to interact with your real Chrome browser window. Close any existing open instances of Chrome, then open your terminal and run the command for your operating system:

* **Linux:**
```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/maps-chrome
```

* **Mac:** (Untested)
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/maps-chrome
```

* **Windows:** (Untested)
```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Google\Chrome\MapsUser"
```

---

### Step 2: Log Into Google Maps & Verify Connection

1. In the Chrome window that just opened, **log into your Google account**.
2. Keep this Chrome window open.
3. Open a second terminal window in your project directory and run the connection check command:
```bash
npx google-maps-list-importer --check
```

4. If the terminal prints `✓ Connected!`, you are ready to proceed.

If this step fails, Google it.

---

### Step 3: Run the Importer

In your terminal window, run:

```bash
npx google-maps-list-importer
```

Your chrome window should start loading pages and saving places.
You can leave the script running in the background. It will process your places, save them to your lists, and add your notes automatically.

### If the tool fails

This tool keeps a log of every place it's processed. So, closing the tool and re-opening it will skip every place that was previously tried. **So just close the tool and run it again**. You can stop the tool with `Ctrl + C` or just close the terminal. Maybe try closing and re-opening chrome.
To retry all placed, delete the created `history/` folder and run the tool again.

#### Bot Detection

You may at some point hit a captcha page. Just complete the captcha and try again.

#### Chrome Crashed

If this happens, just restart Chrome and the tool. It should pick up where it left off. If it keeps happening, try running with a lower `--flush` value. Default is `50`.

---

## What Happens Next?

The script will work through each file in your `lists/` directory, and attempt to add each place in that file to a list with the same name.
At the end of the run, the script will print a summary:

* **Skipped Places:** Places that were already saved, or were already processed by this tool
* **Missing Lists Warning:** If a list wasn't found on your Google Maps account, the script will tell you which ones were missing. Simply go to Google Maps, create the list with that exact name, and re-run the command.
* **Failed Items:** If any link glitched or failed to load, check the `logs/run_<timestamp>/failures` folder. Open any text files inside to view the links that failed so you can click and save them manually.

---

## Verification & Retrying Missing Places

This tool isn't perfect, and sometimes Google doesn't like to save things when you click save. To verify your results:

1. In another browser or on the Google Maps app, check how many places are saved in each of your lists.
2. If the numbers do not match what you expect from your old account:
* Check the **Failed Items** file as some places may be removed from maps
* Delete the history file for that list inside the `history/` folder (for example, delete `history/Coffee Spots.txt`), or delete the entire `history/` folder if you want to retry all lists.
* Run the tool again.

This process may have to be repeated a few times. Sorry, but it is how it is!

---

## Command Line Options (Advanced)

Developers can customize folder paths, target list names for starred places, and port settings using these optional flags:

| Flag | Default | Description |
| --- | --- | --- |
| `--lists`, `-l` | `./lists` | Folder where your Google Takeout CSV/JSON files are stored |
| `--history`, `-h` | `./history` | Folder maintaining cross-run deduplication logs |
| `--logs`, `-o` | `./logs` | Parent folder for execution and failure logs |
| `--starred-list` | `Starred places` | The Google Maps list name where items from your starred places JSON (`Saved Places.json`) will be saved |
| `--saved-places-file` | `Saved Places.json` | The filename of your exported starred places JSON file inside the `lists` folder |
| `--port`, `-p` | `9222` | Chrome DevTools Protocol port |
| `--check`, `-c` | `false` | Runs a quick connectivity check to Chrome and exits |
| `--flush`, `-5` | `50` | Interval to flush the tab. A lower number saves memory, but may be slightly slower.|

#### Custom Usage Examples:

```bash
# Save starred places to a list in another language (e.g., "Mit Stern versehene Orte")
npx google-maps-list-importer --starred-list "Mit Stern versehene Orte"

# Specify a custom folder, JSON file, and target starred places list
npx google-maps-list-importer --lists ./my-takeout --saved-places-file "Starred.json" --starred-list "My Starred Places"
```

---

## LLM Usage Disclosure

ChatGPT and Gemini were used to basically vibe-code this whole thing. It was quite frustrating and I learned nothing, but it was an interesting experiment. It solved an issue I've had for a while, and I didn't need to think about it (that's a lie, I had to think a lot to get the AI to do what I wanted.)

It was easy to get started, and took little effort to keep going, but at some point I think I should have just learned how Playwright worked and started writing the code myself.
/**/

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js"
import { $el } from "../../scripts/ui.js";

const TITLES = [
    "COLOR CONFIGURATION", "COLOR CALIBRATION", "COLOR CUSTOMIZATION",
    "CHROMA CALIBRATION", "CHROMA CONFIGURATION", "CHROMA CUSTOMIZATION",
    "CHROMATIC CALIBRATION", "CHROMATIC CONFIGURATION", "CHROMATIC CUSTOMIZATION",
    "HUE HOMESTEAD", "PALETTE PREFERENCES", "PALETTE PERSONALIZATION",
    "PALETTE PICKER", "PIGMENT PREFERENCES", "PIGMENT PERSONALIZATION",
    "PIGMENT PICKER", "SPECTRUM STYLING", "TINT TAILORING", "TINT TWEAKING"
];

const DEFAULT_THEME = {
    "JOV_CAPTURE 📸": { title: "#661f66" },
    "JOV_GL 🌈": { title: "#1f661f" },
    "JOV_MEASURE 📐": { title: "#993838" },
    "JOV_MIDI 🎛️": { title: "#66661f" },
    "JOV_SPOUT 📺": { title: "#1f6666" },
    "JOVIMETRIX 🔺🟩🔵": { title: "#a23da2" },
    "JOVIMETRIX 🔺🟩🔵/ADJUST": { title: "#2f4e7d" },
    "JOVIMETRIX 🔺🟩🔵/ANIMATION": { title: "#777738" },
    "JOVIMETRIX 🔺🟩🔵/CALC": { title: "#993838" },
    "JOVIMETRIX 🔺🟩🔵/COLOR": { title: "#1b1b87" },
    "JOVIMETRIX 🔺🟩🔵/COMPOSE": { title: "#5c1f9a" },
    "JOVIMETRIX 🔺🟩🔵/CREATE": { title: "#1b871b" },
    "JOVIMETRIX 🔺🟩🔵/TRANSFORM": { title: "#871b87" },
    "JOVIMETRIX 🔺🟩🔵/UTILITY": { title: "#0a0a0a" },
    "JOVIMETRIX 🔺🟩🔵/VARIABLE": { title: "#167070" },
};

const SETTING_REGEX = 'jovi.color.regex';
const SETTING_THEME = 'jovi.color.theme';

let PANEL_COLORIZE, NODE_LIST;

function normalizeHex(hex) {
    if (!hex.startsWith('#')) {
        hex = '#' + hex;
    }

    // If shorthand (e.g., #333), expand it to full form (#333333)
    if (hex.length === 4) {
        hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    return hex.toLowerCase();
}

function colorHex2RGB(hex) {
    hex = hex.replace(/^#/, '');
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return [r, g, b];
}

function colorContrast(hexColor) {
    const rgb = colorHex2RGB(hexColor);
    const normalizedRGB = rgb.map(value => value / 255);
    const L = 0.2126 * normalizedRGB[0] + 0.7152 * normalizedRGB[1] + 0.0722 * normalizedRGB[2];
    return L > 0.420 ? "#000" : "#CCC";
}

function getColor(node) {
    // regex overrides first
    const CONFIG_REGEX = app.extensionManager.setting.get(SETTING_REGEX);
    if (Array.isArray(CONFIG_REGEX)) {
        for (const { regex, ...colors } of CONFIG_REGEX) {
            try {
                if (regex && node.type.match(new RegExp(regex, "i"))) {
                    return colors;
                }
            } catch (error) {
                // console.warn("Invalid regular expression:", regex, error);
            }
        }
    }

    // explicit color set first...
    const CONFIG_THEME = app.extensionManager.setting.get(SETTING_THEME);
    const newColor = CONFIG_THEME?.[node.type]
        ?? (function() {
            const color = NODE_LIST[node.type];
            let k = color?.category;
            while (k) {
                if (CONFIG_THEME?.[k]) {
                    return CONFIG_THEME[k];
                }
                k = k.substring(0, k.lastIndexOf("/"));
            }
        })();

    return newColor;
}

function applyTheme(theme) {
    const majorElements = document.querySelectorAll('.jov-color-panel-cat_major');
    const minorElements = document.querySelectorAll('.jov-color-panel-cat_minor');
    majorElements.forEach(el => el.classList.remove('light', 'dark'));
    minorElements.forEach(el => el.classList.remove('light', 'dark'));
    majorElements.forEach(el => el.classList.add(theme));
    minorElements.forEach(el => el.classList.add(theme));
}

class JovimetrixPanelColorize {
    constructor() {
        this.content = null;
        this.picker = null;
        this.pickerWrapper = null;
        this.buttonCurrent = null;
        this.recentColors = [];
        this.title_content = "HI!"
        this.searchInput = null;
        this.tbody = null;
    }

    createSearchInput() {
        this.searchInput = $el("input", {
            type: "text",
            placeholder: "Filter nodes...",
            className: "jov-color-search-input",
            oninput: (e) => this.filterItems(e.target.value)
        });
        return this.searchInput;
    }

    filterItems(searchTerm) {
        if (!this.tbody) return;

        const searchLower = searchTerm.toLowerCase();
        const rows = this.tbody.querySelectorAll('tr');

        rows.forEach(row => {
            const nameCell = row.querySelector('td:last-child');
            if (!nameCell) return;

            const text = nameCell.textContent.toLowerCase();
            const categoryMatch = row.classList.contains('jov-color-panel-cat_major') ||
                                row.classList.contains('jov-color-panel-cat_minor');

            // Show categories if they or their children match
            if (categoryMatch) {
                const siblingRows = this.getNextSiblingRowsUntilCategory(row);
                const hasVisibleChildren = siblingRows.some(sibling => {
                    const siblingText = sibling.querySelector('td:last-child')?.textContent.toLowerCase() || '';
                    return siblingText.includes(searchLower);
                });

                row.style.display = hasVisibleChildren || text.includes(searchLower) ? '' : 'none';
            } else {
                row.style.display = text.includes(searchLower) ? '' : 'none';
            }
        });
    }

    getNextSiblingRowsUntilCategory(categoryRow) {
        const siblings = [];
        let currentRow = categoryRow.nextElementSibling;

        while (currentRow &&
               !currentRow.classList.contains('jov-color-panel-cat_major') &&
               !currentRow.classList.contains('jov-color-panel-cat_minor')) {
            siblings.push(currentRow);
            currentRow = currentRow.nextElementSibling;
        }

        return siblings;
    }

    createRegexEntry(data) {
        const field = $el("input", { value: data.name });
        field.addEventListener("input", (event) => {
            console.log("Input changed:", event.target.value);
            // React to changes, e.g., validate regex, update UI, etc.
            const CONFIG_REGEX = app.extensionManager.setting.get(SETTING_REGEX);
            CONFIG_REGEX[data.idx]["regex"] = event.target.value;
            app.extensionManager.setting.set(SETTING_REGEX, CONFIG_REGEX);
            app.canvas.setDirty(true);
        });
        return field;
    }

    createColorButton(type, color, data) {
        const label = type == "title" ? "T" : type == "body" ? "B" : "X";
        const button = $el('button.color-button', {
            style: { backgroundColor: color },
            dataset: {
                type: type,
                name: data.name,
                color: color,
                colorOld: color,
                idx: data.idx
            },
            value: label,
            content: label,
            textContent: label,
            label: label
        });

        button.addEventListener('mousedown', (event) => {
            event.stopPropagation();
            if (this.buttonCurrent) {
                this.buttonCurrent.dataset.colorOld = normalizeHex(this.buttonCurrent.dataset.color);
            }
            this.buttonCurrent = event.target;
            this.showPicker(event.target);
        });
        return button;
    }

    async updateConfig() {
        const cb = this.buttonCurrent.dataset;
        const color = normalizeHex(cb.color)
        if (cb.idx && cb.idx !== "undefined") {
            const CONFIG_REGEX = app.extensionManager.setting.get(SETTING_REGEX);
            CONFIG_REGEX[cb.idx][cb.type] = color;
            await app.extensionManager.setting.set(SETTING_REGEX, CONFIG_REGEX);
        } else {
            const CONFIG_THEME = app.extensionManager.setting.get(SETTING_THEME);
            CONFIG_THEME[cb.name] = CONFIG_THEME[cb.name] || (CONFIG_THEME[cb.name] = {});

            let colorCheck = LiteGraph.NODE_DEFAULT_BGCOLOR;
            if (cb.type === "title") {
                colorCheck = LiteGraph.NODE_DEFAULT_COLOR;
            } else if (cb.type === "text") {
                colorCheck = LiteGraph.NODE_TEXT_COLOR;
            }
            colorCheck = normalizeHex(colorCheck);
            if (color === colorCheck && CONFIG_THEME[cb.name] && CONFIG_THEME[cb.name].hasOwnProperty(cb.type)) {
                delete CONFIG_THEME[cb.name][cb.type];
            } else if (color !== colorCheck) {
                CONFIG_THEME[cb.name][cb.type] = color;
            }
            await app.extensionManager.setting.set(SETTING_THEME, CONFIG_THEME);
        }

        this.buttonCurrent.style.backgroundColor = color;
        app.canvas.setDirty(true);
    }

    async pickerCancel() {
        this.buttonCurrent.dataset.colorOld = normalizeHex(this.buttonCurrent.dataset.colorOld);
        this.buttonCurrent.dataset.color = this.buttonCurrent.dataset.colorOld;
        this.pickerWrapper.style.display = 'none';
        await this.updateConfig();
        this.buttonCurrent = null;
    }

    async pickerReset() {
        let colorCheck = LiteGraph.NODE_DEFAULT_BGCOLOR;
        if (this.buttonCurrent.dataset.type === "title") {
            colorCheck = LiteGraph.NODE_DEFAULT_COLOR;
        } else if (this.buttonCurrent.dataset.type === "text") {
            colorCheck = LiteGraph.NODE_TEXT_COLOR;
        }
        this.buttonCurrent.dataset.color = colorCheck;
        await this.updateConfig();
        await this.picker.color.set(colorCheck);
    }

    async pickerColorChange(color) {
        this.buttonCurrent.style.backgroundColor = color;
        this.buttonCurrent.dataset.color = color;
        await this.updateConfig();
    }

    showPicker(button) {
        if (!this.picker) {

            this.pickerWrapper = $el('div.picker-wrapper', {
                style: {
                    position: 'absolute',
                    zIndex: '9999',
                    backgroundColor: '#fff',
                    padding: '5px',
                    borderRadius: '5px',
                    boxShadow: '0 0 10px rgba(0,0,0,0.2)',
                    display: 'none'
                }
            });

            const pickerElement = $el('div.picker');
            const recentColorsElement = $el('div.recent-colors');
            const buttonWrapper = $el('div.button-wrapper', {
                style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '10px'
                }
            });
            const cancelButton = $el('button', {
                textContent: 'Cancel',
                onclick: async () => this.pickerCancel()
            });

            const resetButton = $el('button', {
                textContent: 'Reset',
                onclick: async () => this.pickerReset()
            });

            buttonWrapper.appendChild(cancelButton);
            buttonWrapper.appendChild(resetButton);

            this.pickerWrapper.appendChild(pickerElement);
            this.pickerWrapper.appendChild(recentColorsElement);
            this.pickerWrapper.appendChild(buttonWrapper);

            document.body.appendChild(this.pickerWrapper);

            this.picker = new iro.ColorPicker(pickerElement, {
                width: 200,
                color: '#ffffff',
                display: 'block',
                layout: [
                    {
                        component: iro.ui.Slider,
                        options: { sliderType: 'hue' }
                    },
                    {
                        component: iro.ui.Slider,
                        options: { sliderType: 'value' }
                    },
                    {
                        component: iro.ui.Slider,
                        options: { sliderType: 'saturation' }
                    },
                ]
            });

            this.picker.on('color:change', async (color) => this.pickerColorChange(color.hexString));
        }

        this.picker.color.set(button.dataset.color || '#ffffff');
        const buttonRect = button.getBoundingClientRect();
        const pickerRect = this.pickerWrapper.getBoundingClientRect();

        let left = buttonRect.left;
        let top = buttonRect.bottom + 5;

        if (left + pickerRect.width > window.innerWidth) {
            left = window.innerWidth - pickerRect.width - 5;
        }

        if (top + pickerRect.height > window.innerHeight) {
            top = buttonRect.top - pickerRect.height - 5;
        }

        this.pickerWrapper.style.left = `${left}px`;
        this.pickerWrapper.style.top = `${top}px`;
        this.pickerWrapper.style.display = 'block';
        this.updateRecentColors(button);
    }

    updateRecentColors(button) {
        const color = button.dataset.color;
        if (!this.recentColors.includes(color)) {
            this.recentColors.unshift(color);
            if (this.recentColors.length > 5) {
                this.recentColors.pop();
            }
        }

        const recentColorsElement = this.pickerWrapper.querySelector('.recent-colors');
        recentColorsElement.innerHTML = '';
        this.recentColors.forEach(recentColor => {
            const colorSwatch = $el('div', {
                style: {
                    width: '20px',
                    height: '20px',
                    backgroundColor: recentColor,
                    display: 'inline-block',
                    margin: '2px',
                    cursor: 'pointer'
                },
                onclick: () => this.picker.color.set(recentColor)
            });
            recentColorsElement.appendChild(colorSwatch);
        });
    }

    templateColorRow(data, type, classList = "jov-color-panel-category") {
        const titleColor = data.title || LiteGraph.NODE_DEFAULT_COLOR;
        const bodyColor = data.body || LiteGraph.NODE_DEFAULT_BGCOLOR;
        const textColor = data.text || LiteGraph.NODE_TEXT_COLOR;

        // Determine background color based on class
        let rowClass = classList;
        let style = {};

        if (classList === "jov-color-panel-cat_major") {
            // Darker background for major categories
            style.backgroundColor = "var(--border-color)";
        } else if (classList === "jov-color-panel-cat_minor") {
            style.backgroundColor = "var(--tr-odd-bg-color)";
        }

        const element = $el("tr", { className: rowClass, style }, [
            $el("td", {}, [this.createColorButton("title", titleColor, data)]),
            $el("td", {}, [this.createColorButton("body", bodyColor, data)]),
            $el("td", {}, [this.createColorButton("text", textColor, data)]),
            (type === "regex") ?
                $el("td", {}, [this.createRegexEntry(data)]) :
                $el("td", { textContent: data.name })
        ]);

        return element;
    }

    createRegexPalettes() {
        const table = $el("table.flexible-table");
        this.tbody = $el("tbody");

        let CONFIG_REGEX = app.extensionManager.setting.get(SETTING_REGEX) || [];
        if (!Array.isArray(CONFIG_REGEX)) {
            CONFIG_REGEX = []
        }
        CONFIG_REGEX.forEach((entry, idx) => {
            const data = {
                idx: idx,
                name: entry.regex,
                title: entry.title,
                body: entry.body,
                text: entry.body
            };
            this.tbody.appendChild(this.templateColorRow(data, "regex"));
        });

        table.appendChild(this.tbody);
        return table;
    }

    createColorPalettes() {
        let background_index = 0;
        const categories = [];
        const CONFIG_THEME = app.extensionManager.setting.get(SETTING_THEME);

        Object.entries(NODE_LIST).forEach(([nodeName, node]) => {
            const category = node.category;
            const majorCategory = category.split("/")?.[0];

            if (!categories.includes(majorCategory)) {
                background_index = (background_index + 1) % 2;
                const element = {
                    name: majorCategory,
                    title: CONFIG_THEME?.[majorCategory]?.title,
                    body: CONFIG_THEME?.[majorCategory]?.body,
                    text: CONFIG_THEME?.[majorCategory]?.text
                };
                this.tbody.appendChild(this.templateColorRow(element, null, "jov-color-panel-cat_major"));
                categories.push(majorCategory);
            }

            if (!categories.includes(category)) {
                background_index = (background_index + 1) % 2;
                const element = {
                    name: category,
                    title: CONFIG_THEME?.[category]?.title,
                    body: CONFIG_THEME?.[category]?.body,
                    text: CONFIG_THEME?.[category]?.text
                };
                this.tbody.appendChild(this.templateColorRow(element, null, "jov-color-panel-cat_minor"));
                categories.push(category);
            }

            const nodeConfig = CONFIG_THEME[nodeName] || {};
            const data = {
                name: nodeName,
                title: nodeConfig.title,
                body: nodeConfig.body,
                text: nodeConfig.text
            };
            this.tbody.appendChild(this.templateColorRow(data));
        });
    }

    getRandomTitle() {
        return TITLES[Math.floor(Math.random() * TITLES.length)];
    }

    createContent() {
        if (!this.content) {
            const table = this.createRegexPalettes();
            this.createColorPalettes();

            this.title_content = $el("div.jov-color-header", { textContent: "EMPTY" });
            this.content = $el("div.jov-color-panel", [
                $el("div.jov-color", [this.title_content]),
                this.createSearchInput(),  // Add search input
                $el("div", [table]),
                $el("div.button", []),
            ]);

            // hide the picker when clicking outside
            document.addEventListener('click', async (event) => {
                if (this.picker && !this.pickerWrapper.contains(event.target) && !event.target.classList.contains('color-button')) {
                    this.pickerWrapper.style.display = 'none';
                    if (this.buttonCurrent) {
                        this.buttonCurrent.dataset.colorOld = normalizeHex(this.buttonCurrent.dataset.color);
                    }
                }
            });
        }
        applyTheme('light');
        this.title_content.textContent = this.getRandomTitle();
        return this.content;
    }
}

app.extensionManager.registerSidebarTab({
    id: "jovi.sidebar.colorizer",
    icon: "pi pi-palette",
    title: "JOVI COLORIZER 🔺🟩🔵",
    tooltip: "Color node title and body via unique name, group and regex filtering\nJOVI_COLORIZER",
    type: "custom",
    render: async (el) => {
        el.innerHTML = "";
        if (typeof PANEL_COLORIZE === "undefined" || !PANEL_COLORIZE) {
            PANEL_COLORIZE = new JovimetrixPanelColorize();
        }
        el.appendChild(PANEL_COLORIZE.createContent());
    }
});

app.registerExtension({
    name: "jovi.color",
    settings: [
        {
            id: SETTING_REGEX,
            name: "Regex Entries for Jovi Colorizer",
            type: "hidden",
            defaultValue: {}
        },
        {
            id: SETTING_THEME,
            name: "Node theme entries for Jovi Colorizer",
            type: "hidden",
            defaultValue: {}
        },
    ],
    async init() {
        const styleTagId = 'jovi_color-stylesheet';
        let styleTag = document.getElementById(styleTagId);
        if (styleTag) {
            return;
        }

        document.head.appendChild(Object.assign(document.createElement('link'), {
            id: styleTagId,
            rel: 'stylesheet',
            type: 'text/css',
            href: 'extensions/jovi_colorizer/jovi_colorizer.css'
        }));

        document.head.appendChild(Object.assign(document.createElement('script'), {
            src: "https://cdn.jsdelivr.net/npm/@jaames/iro@5"
        }));
    },
    async setup() {

        var response = await api.fetchApi("/object_info", { cache: "no-store" });
        const all_nodes = await response.json();

        NODE_LIST = Object.entries(all_nodes).sort((a, b) => {
            const categoryA = a[1].category.toLowerCase();
            const categoryB = b[1].category.toLowerCase();

            // First, sort by category
            if (categoryA < categoryB) return -1;
            if (categoryA > categoryB) return 1;

            // If categories are equal, sort by key name
            return a[0].toLowerCase().localeCompare(b[0].toLowerCase());
        });
        NODE_LIST = Object.fromEntries(NODE_LIST);

        let CONFIG_REGEX = app.extensionManager.setting.get(SETTING_REGEX) || [];
        if (!Array.isArray(CONFIG_REGEX)) {
            CONFIG_REGEX = [];
        }
        while (CONFIG_REGEX.length < 5) {
            CONFIG_REGEX.push({ "regex": "" });
        }
        await app.extensionManager.setting.set(SETTING_REGEX, CONFIG_REGEX);

        let CONFIG_THEME = app.extensionManager.setting.get(SETTING_THEME) || {};
        Object.keys(DEFAULT_THEME).forEach(key => {
            if (!(key in CONFIG_THEME)) {
                CONFIG_THEME[key] = DEFAULT_THEME[key];
            }
        });

        try {
            await app.extensionManager.setting.set(SETTING_THEME, CONFIG_THEME);
        } catch (error) {
            console.error("Failed to update settings:", error);
        }
    }
});

const origDrawNode = LGraphCanvas.prototype.drawNode;
LGraphCanvas.prototype.drawNode = function (node, ctx) {
    // STASH THE CURRENT COLOR STATE
    const origTitle = node.constructor.title_text_color;
    const origSelectedTitleColor = LiteGraph.NODE_SELECTED_TITLE_COLOR;
    const origNodeTextColor = LiteGraph.NODE_TEXT_COLOR;
    const origWidgetSecondaryTextColor = LiteGraph.WIDGET_SECONDARY_TEXT_COLOR;
    const origWidgetTextColor = LiteGraph.WIDGET_TEXT_COLOR;
    const origNodeTitleColor = LiteGraph.NODE_TITLE_COLOR;
    const origWidgetBGColor = LiteGraph.WIDGET_BGCOLOR;

    const new_color = getColor(node);

    if (new_color) {
        // Title text when node is selected
        //LiteGraph.NODE_SELECTED_TITLE_COLOR = '#FF00FF'

        if (new_color?.text) {
            node.constructor.title_text_color = new_color.text;
        } else {
            const color = node.constructor.title_text_color;
            if (color) {
                node.constructor.title_text_color = colorContrast(color);
            }
        }

        // Slot label text
        //LiteGraph.NODE_TEXT_COLOR = '#7777FF'

        // Widget Text
        //LiteGraph.WIDGET_SECONDARY_TEXT_COLOR = "#FFFFFF"

        // Widget controls + field text
        //LiteGraph.WIDGET_TEXT_COLOR = '#FF0000';

        // Widget control BG color
        // LiteGraph.WIDGET_BGCOLOR

        // node's title bar background color
        if (new_color?.title) {
            node.color = new_color.title;
        }

        // node's body background color
        if (new_color?.body) {
            node.bgcolor = new_color.body;
        }
    }

    const res = origDrawNode.apply(this, arguments);

    // Default back to last pushed state ComfyUI colors
    if (new_color) {
        node.constructor.title_text_color = origTitle;
        LiteGraph.NODE_SELECTED_TITLE_COLOR = origSelectedTitleColor;
        LiteGraph.NODE_TEXT_COLOR = origNodeTextColor;
        LiteGraph.WIDGET_SECONDARY_TEXT_COLOR = origWidgetSecondaryTextColor;
        LiteGraph.WIDGET_TEXT_COLOR = origWidgetTextColor;
        LiteGraph.NODE_TITLE_COLOR = origNodeTitleColor;
        LiteGraph.WIDGET_BGCOLOR = origWidgetBGColor;
    }

    return res;
}
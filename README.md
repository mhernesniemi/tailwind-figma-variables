# Tailwind v4 → Figma Variables JSON

Converts the Tailwind CSS default theme (`tailwindcss/theme.css`) into a JSON
file you can import straight into Figma as variables — using Figma's native
variable import. Pinned to whatever `tailwindcss` version is installed
(currently **4.3.3**).

## Download

- [`tailwind-v4.3.3.json`](https://github.com/mhernesniemi/tailwind-figma-variables/releases/download/v4.3.3/tailwind-v4.3.3.json)

## Or build it yourself

```sh
npm install
npm run build
```

Outputs `dist/tailwind-v4.3.3.json`.

## Updating to a new Tailwind release

```sh
npm install tailwindcss@latest && npm run build
```

The output filename picks up the installed version automatically.

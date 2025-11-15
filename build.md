# Sheets Switcher

Enables fast switching between Google Sheets Worksheets.

## Building the Extension

This project uses `npm` and the `crx` package to build and pack the extension.

### Prerequisites

You must have [Node.js and npm](https://nodejs.org/) installed.

### 1. Install Dependencies

First, install the required development packages from your project's root directory:

```bash
npm install
````

### 2\. Building the `.crx` File

There are two scripts for packing the extension.

**A. First-Time Build (Creating the key)**

If this is your first time building the project, you must generate a private key (`.pem`) file. This key is used to sign the extension and ensure that future updates are recognized by Chrome.

```bash
npm run pack-first
```

This command will:

1.  Create `sheets-switcher.crx` (the packed extension).
2.  Create `key.pem` (your private key).

> **Important:** **Back up your `key.pem` file immediately.** If you lose it, you will not be able to publish updates to your extension on the Chrome Web Store.

**B. Regular Builds (Re-using the key)**

For all future builds, use the `pack` script to reuse your existing `key.pem` file. This ensures the extension keeps the same ID.

```bash
npm run pack
```

### 3\. Creating the Web Store ZIP File

When uploading to the Chrome Web Store, you must provide a `.zip` file containing your *source code* (not the `.crx` file).

Use the following script to create a clean `sheets-switcher-source.zip` file, which automatically excludes `node_modules`, build artifacts, and `.git` files:

```bash
npm run build:zip
```

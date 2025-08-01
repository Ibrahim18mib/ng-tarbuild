# ng-tarbuild 🔧📦

[![NPM version](https://img.shields.io/npm/v/ng-tarbuild)](https://www.npmjs.com/package/ng-tarbuild)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> Build Angular projects and package them into `.tar` or `.tar.gz` archives, effortlessly!

## ✨ Features

- 🏗️ Runs Angular build with production config
- 📂 Moves output from `/browser` to root
- 📦 Archives as `.tar`
- 🔄 Renames `index.csr.html` to `index.html`
- ⚡ Clean CLI UX with spinners and colors

## 📦 Installation

```bash
npm install -g ng-tarbuild
```

# Basic usage

ng-tarbuild --out=my-doctor-app

# Without compression

ng-tarbuild --out=clinic --no-compress

# Skip Angular Build (--skip-build)

ng-tarbuild --out=my-app --skip-build

# Rename folder inside the tar

ng-tarbuild --out=clinic --rename=clinic-v2

# Custom Angular project path

ng-tarbuild --out=health-app --path=../my-angular-app

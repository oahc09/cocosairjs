/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
const path = require("node:path");
const repo = path.resolve(__dirname, "../../box3d-rebuild-20261022");
module.exports = {
  ...require(path.join(repo, "jest.config.js")),
  rootDir: repo,
  roots: [__dirname],
  testMatch: [path.join(__dirname, "pause-green-control.test.ts")],
  cacheDirectory: path.join(__dirname, "jest-cache"),
  testTimeout: 20000,
};

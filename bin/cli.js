#!/usr/bin/env node

/**
 * CLI History Hub - Command Line Interface
 *
 * Usage:
 *   cli-history-hub start   Start the server (background)
 *   cli-history-hub stop    Stop the running server
 *   cli-history-hub status  Check if server is running
 *   cli-history-hub open    Start and open in browser
 *   cli-history-hub         Start in foreground (default)
 */

'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');
var childProcess = require('child_process');

var PID_FILE = path.join(os.tmpdir(), 'cli-history-hub.pid');
var DEFAULT_PORT = process.env.PORT || 3456;
var SERVER_SCRIPT = path.join(__dirname, '..', 'server.js');

var command = process.argv[2] || 'foreground';

// Parse --port flag
var portIdx = process.argv.indexOf('--port');
if (portIdx !== -1 && process.argv[portIdx + 1]) {
  DEFAULT_PORT = parseInt(process.argv[portIdx + 1], 10);
}

switch (command) {
  case 'start':
    startBackground();
    break;
  case 'stop':
    stop();
    break;
  case 'status':
    status();
    break;
  case 'open':
    startBackground(function () {
      openBrowser('http://localhost:' + DEFAULT_PORT);
    });
    break;
  case 'foreground':
  case 'serve':
    startForeground();
    break;
  case '--help':
  case '-h':
  case 'help':
    printHelp();
    break;
  case '--version':
  case '-v':
    printVersion();
    break;
  default:
    console.error('Unknown command: ' + command);
    printHelp();
    process.exit(1);
}

function startForeground() {
  process.env.PORT = DEFAULT_PORT;
  require(SERVER_SCRIPT);
}

function startBackground(callback) {
  // Check if already running
  var pid = readPid();
  if (pid && isProcessRunning(pid)) {
    console.log('CLI History Hub is already running (PID: ' + pid + ')');
    console.log('  http://localhost:' + DEFAULT_PORT);
    if (callback) callback();
    return;
  }

  var child = childProcess.spawn(process.execPath, [SERVER_SCRIPT], {
    env: Object.assign({}, process.env, { PORT: String(DEFAULT_PORT) }),
    detached: true,
    stdio: 'ignore',
  });

  child.unref();
  fs.writeFileSync(PID_FILE, String(child.pid));

  console.log('CLI History Hub started (PID: ' + child.pid + ')');
  console.log('  http://localhost:' + DEFAULT_PORT);
  console.log('');
  console.log('Run "cli-history-hub stop" to stop the server.');

  if (callback) {
    setTimeout(callback, 800);
  }
}

function stop() {
  var pid = readPid();
  if (!pid) {
    console.log('CLI History Hub is not running (no PID file).');
    return;
  }

  if (!isProcessRunning(pid)) {
    console.log('CLI History Hub is not running (stale PID: ' + pid + ').');
    removePid();
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log('CLI History Hub stopped (PID: ' + pid + ').');
    removePid();
  } catch (e) {
    console.error('Failed to stop process: ' + e.message);
  }
}

function status() {
  var pid = readPid();
  if (pid && isProcessRunning(pid)) {
    console.log('CLI History Hub is running (PID: ' + pid + ')');
    console.log('  http://localhost:' + DEFAULT_PORT);
  } else {
    console.log('CLI History Hub is not running.');
    if (pid) removePid();
  }
}

function readPid() {
  try {
    var content = fs.readFileSync(PID_FILE, 'utf-8').trim();
    return parseInt(content, 10) || null;
  } catch (e) {
    return null;
  }
}

function removePid() {
  try { fs.unlinkSync(PID_FILE); } catch (e) { /* ignore */ }
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

function openBrowser(url) {
  var cmd;
  switch (process.platform) {
    case 'darwin': cmd = 'open'; break;
    case 'win32': cmd = 'start'; break;
    default: cmd = 'xdg-open';
  }
  childProcess.exec(cmd + ' ' + url);
}

function printVersion() {
  try {
    var pkg = require(path.join(__dirname, '..', 'package.json'));
    console.log('cli-history-hub v' + pkg.version);
  } catch (e) {
    console.log('cli-history-hub (unknown version)');
  }
}

function printHelp() {
  console.log('');
  console.log('  CLI History Hub - Browse AI coding assistant conversation history');
  console.log('');
  console.log('  Usage: cli-history-hub [command] [options]');
  console.log('');
  console.log('  Commands:');
  console.log('    start          Start the server in background');
  console.log('    stop           Stop the running server');
  console.log('    status         Check if server is running');
  console.log('    open           Start and open in browser');
  console.log('    (no command)   Start in foreground');
  console.log('');
  console.log('  Options:');
  console.log('    --port <num>   Port number (default: 3456)');
  console.log('    --help, -h     Show this help');
  console.log('    --version, -v  Show version');
  console.log('');
}

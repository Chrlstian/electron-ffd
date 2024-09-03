const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn, exec } = require('child_process');
// const fs = require('fs');
const path = require('path');
const url = require('url');

let serverProcess = null;
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  // Open DevTools by default
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize allowedUsers and create the main window when the app is ready
app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
      app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
  }
});


ipcMain.on('start-server', (event) => {
    if (serverProcess) {
      event.reply('server-status', 'The server is already running.');
      return;
    }
  
    // Use spawn to run 'npm run server'
    serverProcess = spawn('npm', ['run', 'server'], {
      stdio: 'inherit',
      cwd: __dirname,
      shell: true,
      detached: true // Allow the process to run independently
    });
  
    serverProcess.unref(); // Allow the parent process to exit independently of the child process
  
    serverProcess.on('exit', (code, signal) => {
      console.log(`Server process exited with code ${code} and signal ${signal}`);
      serverProcess = null;
      event.reply('server-status', 'The server has been stopped.');
    });
  
    event.reply('server-status', 'The server has started.');
});

//   ipcMain.on('stop-server', (event) => {
//     if (serverProcess) {
//       serverProcess.kill('SIGINT'); // Send SIGINT to gracefully terminate the process
//       serverProcess = null;
//       event.reply('server-status', 'The server has been stopped.');
//     } else {
//       event.reply('server-status', 'The server is not running.');
//     }
//   });


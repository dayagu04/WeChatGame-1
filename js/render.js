GameGlobal.canvas = wx.createCanvas();

const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();

canvas.width = windowInfo.screenWidth;
canvas.height = windowInfo.screenHeight;

export const SCREEN_WIDTH = windowInfo.screenWidth;
export const SCREEN_HEIGHT = windowInfo.screenHeight;
// 安全区域（刘海屏/底部横条）
export const SAFE_TOP = (windowInfo.safeArea && windowInfo.safeArea.top) || 0;
export const SAFE_BOTTOM = (windowInfo.safeArea && windowInfo.screenHeight - windowInfo.safeArea.bottom) || 0;

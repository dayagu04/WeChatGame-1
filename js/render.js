GameGlobal.canvas = wx.createCanvas();

const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();

export const SCREEN_WIDTH = windowInfo.screenWidth;
export const SCREEN_HEIGHT = windowInfo.screenHeight;
export const PIXEL_RATIO = windowInfo.pixelRatio || 1;

// canvas 默认尺寸已是物理像素，无需重设
// 逻辑尺寸用于 UI 坐标（触摸、布局）

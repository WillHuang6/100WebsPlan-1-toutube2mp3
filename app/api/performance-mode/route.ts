import { NextRequest, NextResponse } from 'next/server';
import { 
  PERFORMANCE_MODES, 
  getCurrentPerformanceMode, 
  getCurrentPerformanceModeName,
  setCurrentPerformanceMode 
} from '@/lib/performance';

// 🎯 性能模式管理 API

// GET - 获取当前性能模式和所有可用模式
export async function GET(req: NextRequest) {
  const currentModeName = getCurrentPerformanceModeName();
  return NextResponse.json({
    currentMode: currentModeName,
    currentConfig: getCurrentPerformanceMode(),
    availableModes: PERFORMANCE_MODES,
    timestamp: new Date().toISOString()
  });
}

// POST - 设置性能模式
export async function POST(req: NextRequest) {
  try {
    const { mode, reason } = await req.json();
    
    if (!PERFORMANCE_MODES[mode]) {
      return NextResponse.json({
        error: 'Invalid performance mode',
        availableModes: Object.keys(PERFORMANCE_MODES)
      }, { status: 400 });
    }
    
    const previousMode = getCurrentPerformanceModeName();
    const success = setCurrentPerformanceMode(mode);
    
    if (!success) {
      return NextResponse.json({
        error: 'Failed to set performance mode'
      }, { status: 500 });
    }
    
    console.log(`🎯 性能模式切换: ${previousMode} → ${mode}`);
    if (reason) {
      console.log(`📝 切换原因: ${reason}`);
    }
    
    return NextResponse.json({
      success: true,
      previousMode,
      currentMode: mode,
      currentConfig: getCurrentPerformanceMode(),
      message: `性能模式已切换到 ${PERFORMANCE_MODES[mode].description}`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    return NextResponse.json({
      error: 'Invalid request format',
      message: (error as Error).message
    }, { status: 400 });
  }
}


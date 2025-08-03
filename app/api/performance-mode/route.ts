import { NextRequest, NextResponse } from 'next/server';

// 🎯 性能模式管理 API
interface PerformanceMode {
  mode: 'conservative' | 'balanced' | 'aggressive';
  description: string;
  ytdlpConfig: {
    concurrentFragments: number;
    chunkSize: string;
    bufferSize: string;
    retries: number;
  };
  ffmpegConfig: {
    threads: string;
    preset: string;
    additionalArgs: string[];
  };
  expectedPerformance: string;
  recommendedFor: string[];
}

const PERFORMANCE_MODES: Record<string, PerformanceMode> = {
  conservative: {
    mode: 'conservative',
    description: '保守模式 - 稳定优先，适合网络较慢或系统资源有限的环境',
    ytdlpConfig: {
      concurrentFragments: 2,
      chunkSize: '1M',
      bufferSize: '8K',
      retries: 3
    },
    ffmpegConfig: {
      threads: 'cores',
      preset: 'medium',
      additionalArgs: []
    },
    expectedPerformance: '稳定，时间较长',
    recommendedFor: ['网络较慢', '系统资源有限', '稳定性优先']
  },
  
  balanced: {
    mode: 'balanced',
    description: '平衡模式 - 性能与稳定性的最佳平衡',
    ytdlpConfig: {
      concurrentFragments: 4,
      chunkSize: '2M',
      bufferSize: '16K',
      retries: 3
    },
    ffmpegConfig: {
      threads: 'cores',
      preset: 'fast',
      additionalArgs: ['-map_metadata', '-1']
    },
    expectedPerformance: '中等速度，高成功率',
    recommendedFor: ['一般网络环境', '标准系统配置', '日常使用']
  },
  
  aggressive: {
    mode: 'aggressive',
    description: '激进模式 - 最大性能，需要良好的网络和系统配置',
    ytdlpConfig: {
      concurrentFragments: 8,
      chunkSize: '4M',
      bufferSize: '32K',
      retries: 5
    },
    ffmpegConfig: {
      threads: 'cores*1.5',
      preset: 'ultrafast',
      additionalArgs: ['-map_metadata', '-1', '-compression_level', '0']
    },
    expectedPerformance: '最快速度，但可能不稳定',
    recommendedFor: ['高速网络', '高性能系统', '批量处理']
  }
};

let currentMode: string = 'balanced'; // 默认平衡模式

// GET - 获取当前性能模式和所有可用模式
export async function GET(req: NextRequest) {
  return NextResponse.json({
    currentMode,
    currentConfig: PERFORMANCE_MODES[currentMode],
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
    
    const previousMode = currentMode;
    currentMode = mode;
    
    console.log(`🎯 性能模式切换: ${previousMode} → ${mode}`);
    if (reason) {
      console.log(`📝 切换原因: ${reason}`);
    }
    
    return NextResponse.json({
      success: true,
      previousMode,
      currentMode,
      currentConfig: PERFORMANCE_MODES[currentMode],
      message: `性能模式已切换到 ${PERFORMANCE_MODES[currentMode].description}`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    return NextResponse.json({
      error: 'Invalid request format',
      message: (error as Error).message
    }, { status: 400 });
  }
}

// 导出当前模式获取函数，供其他模块使用
export function getCurrentPerformanceMode(): PerformanceMode {
  return PERFORMANCE_MODES[currentMode];
}

// 自动性能模式调整 - 基于最近的性能表现
export function autoAdjustPerformanceMode(recentPerformance: {
  averageTime: number;
  successRate: number;
  errorCount: number;
}) {
  const { averageTime, successRate, errorCount } = recentPerformance;
  
  // 如果成功率很低或错误很多，切换到保守模式
  if (successRate < 0.7 || errorCount > 3) {
    if (currentMode !== 'conservative') {
      console.log('🚨 自动切换到保守模式：成功率较低或错误较多');
      currentMode = 'conservative';
      return true;
    }
  }
  // 如果性能很好，可以尝试更激进的模式
  else if (successRate > 0.95 && averageTime < 30000 && currentMode === 'conservative') {
    console.log('🚀 自动切换到平衡模式：性能表现良好');
    currentMode = 'balanced';
    return true;
  }
  
  return false;
}
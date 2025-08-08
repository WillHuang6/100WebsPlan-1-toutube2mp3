import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    console.log('🧹 开始Redis清理...');
    
    const { getRedisClient } = await import('@/lib/kv');
    const redis = await getRedisClient();
    
    // 获取所有音频文件键
    const audioKeys = await redis.keys('audio:*');
    const titleKeys = await redis.keys('title:*');
    const allKeys = [...audioKeys, ...titleKeys];
    
    console.log(`📊 找到 ${audioKeys.length} 个音频文件和 ${titleKeys.length} 个标题`);
    
    // 检查过期的键
    const expiredKeys = [];
    const validKeys = [];
    
    for (const key of allKeys) {
      const ttl = await redis.ttl(key);
      if (ttl < 0 || ttl < 1800) { // 删除已过期或30分钟内过期的
        expiredKeys.push(key);
      } else {
        validKeys.push(key);
      }
    }
    
    // 删除过期键
    if (expiredKeys.length > 0) {
      await redis.del(...expiredKeys);
      console.log(`🧹 删除了 ${expiredKeys.length} 个过期键`);
    }
    
    // 获取内存使用信息
    const memoryInfo = await redis.memory('USAGE');
    console.log(`💾 清理后内存使用: ${(memoryInfo / 1024 / 1024).toFixed(2)}MB`);
    
    return NextResponse.json({
      success: true,
      message: 'Redis cleanup completed',
      stats: {
        totalKeys: allKeys.length,
        expiredKeys: expiredKeys.length,
        validKeys: validKeys.length,
        memoryUsageMB: (memoryInfo / 1024 / 1024).toFixed(2)
      }
    });
    
  } catch (error) {
    console.error('❌ Redis清理失败:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Cleanup failed',
      details: (error as Error).message
    }, { status: 500 });
  }
}
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
      const deleteResult = await redis.del(expiredKeys);
      console.log(`🧹 删除了 ${deleteResult} 个过期键`);
    }
    
    console.log(`💾 清理完成`);
    
    return NextResponse.json({
      success: true,
      message: 'Redis cleanup completed',
      stats: {
        totalKeys: allKeys.length,
        expiredKeys: expiredKeys.length,
        validKeys: validKeys.length
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
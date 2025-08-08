import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }
    
    console.log('📥 下载请求:', taskId);
    
    // 从Redis获取音频数据
    const { getRedisClient } = await import('@/lib/kv');
    const redis = await getRedisClient();
    
    console.log('🔍 从Redis读取音频数据...');
    const audioBuffer = await redis.getBuffer(`audio:${taskId}`);
    const title = await redis.get(`title:${taskId}`);
    
    console.log('🔍 Redis结果:');
    console.log('  - 音频数据存在:', !!audioBuffer);
    console.log('  - 标题存在:', !!title);
    
    if (!audioBuffer || !title) {
      console.log('❌ 文件未找到或已过期');
      return NextResponse.json({ 
        error: 'File not found or expired',
        taskId: taskId
      }, { status: 404 });
    }
    
    const cached = { audioBuffer, title };
    
    console.log(`📥 下载文件: ${taskId}, 大小: ${(cached.audioBuffer.length / 1024 / 1024).toFixed(2)}MB`);
    
    // 设置合适的headers
    const fileName = `${cached.title.replace(/[^a-zA-Z0-9\-_\s]/g, '').substring(0, 50)}.mp3`;
    
    return new NextResponse(cached.audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': cached.audioBuffer.length.toString(),
        'Cache-Control': 'public, max-age=86400, immutable'
      }
    });
    
  } catch (error) {
    console.error('❌ 下载失败:', error);
    return NextResponse.json({
      error: 'Download failed',
      details: (error as Error).message
    }, { status: 500 });
  }
}
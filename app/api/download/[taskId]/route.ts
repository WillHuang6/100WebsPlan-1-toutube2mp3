import { NextRequest, NextResponse } from 'next/server';
import { tasks } from '@/lib/tasks';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  
  // 检查任务是否存在且已完成
  const task = tasks.get(taskId);
  if (!task || task.status !== 'finished') {
    return NextResponse.json({ error: 'File not found or not ready' }, { status: 404 });
  }
  
  // 构建文件路径
  const tempDir = os.tmpdir();
  const filePath = path.join(tempDir, `${taskId}.mp3`);
  
  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    console.error('文件不存在:', filePath);
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
  
  try {
    // 获取文件信息
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    
    // 处理Range请求（支持断点续传和流式播放）
    const range = req.headers.get('range');
    
    if (range) {
      // 解析Range头
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      // 创建流
      const stream = fs.createReadStream(filePath, { start, end });
      
      return new NextResponse(stream as any, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } else {
      // 常规流式传输
      const stream = fs.createReadStream(filePath);
      
      return new NextResponse(stream as any, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': `attachment; filename="${taskId}.mp3"`,
          'Content-Length': fileSize.toString(),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  } catch (error) {
    console.error('读取文件失败:', error);
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
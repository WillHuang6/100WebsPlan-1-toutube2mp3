import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { taskManager } from '@/lib/tasks';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const execAsync = promisify(exec);

// 缓存
const urlCache = new Map<string, { file_url: string; created_at: number }>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// 生成缓存键
function getCacheKey(url: string): string {
  return crypto.createHash('md5').update(url).digest('hex');
}

// 验证YouTube URL
function isValidYouTubeUrl(url: string): boolean {
  const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/;
  return youtubeRegex.test(url);
}

// 提取视频ID
function extractVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1] : null;
}

// 主要转换函数
export async function POST(req: NextRequest) {
  const { url, format } = await req.json();
  
  if (!isValidYouTubeUrl(url)) {
    return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
  }
  
  // 检查缓存
  const cacheKey = getCacheKey(url);
  const cached = urlCache.get(cacheKey);
  if (cached && Date.now() - cached.created_at < CACHE_DURATION) {
    const cachedTaskId = uuidv4();
    await taskManager.create(cachedTaskId, { 
      status: 'finished', 
      file_url: cached.file_url, 
      progress: 100 
    });
    console.log('🚀 Cache hit for URL:', url);
    return NextResponse.json({ task_id: cachedTaskId, status: 'finished' });
  }
  
  const task_id = uuidv4();
  await taskManager.create(task_id, { status: 'processing', progress: 0 });

  console.log('🚀 任务开始:', task_id);
  console.log('📋 目标URL:', url);
  
  // 环境检测和选择处理方式
  const isVercel = process.env.VERCEL === '1';
  console.log('🌐 运行环境:', isVercel ? 'Vercel' : '本地');
  console.log('🔧 VERCEL 环境变量:', process.env.VERCEL);
  
  if (isVercel) {
    // Vercel 环境：使用第三方 API
    processWithAPI(task_id, url, cacheKey).catch(async error => {
      console.error('❌ processWithAPI error:', error);
      try {
        await taskManager.update(task_id, { 
          status: 'error', 
          error: '处理过程中发生错误，请稍后重试' 
        });
      } catch (updateError) {
        console.error('❌ Failed to update error status:', updateError);
      }
    });
  } else {
    // 本地环境：使用 yt-dlp
    processWithYtDlp(task_id, url, cacheKey).catch(async error => {
      console.error('❌ processWithYtDlp error:', error);
      try {
        await taskManager.update(task_id, { 
          status: 'error', 
          error: '处理过程中发生错误，请稍后重试' 
        });
      } catch (updateError) {
        console.error('❌ Failed to update error status:', updateError);
      }
    });
  }
  
  // 定期清理过期缓存
  cleanupExpiredCache();
  
  return NextResponse.json({ task_id, status: 'processing' });
}

// 使用第三方 API (Vercel 环境)
async function processWithAPI(task_id: string, url: string, cacheKey: string) {
  const startTime = Date.now();
  const maxProcessTime = 5 * 60 * 1000; // 5分钟最大处理时间
  
  const videoId = extractVideoId(url);
  if (!videoId) {
    console.log('❌ 无法提取视频ID:', url);
    await taskManager.update(task_id, { status: 'error', error: '无法提取视频ID' });
    return;
  }

  console.log('🎯 Vercel 环境：使用第三方 API 处理, 视频ID:', videoId);
  console.log('⚡ 函数开始时间:', new Date().toISOString());
  
  // 改进的超时处理 - 延长到9秒，并添加更好的错误处理
  const vercelTimeout = 9000; // 9秒
  let isCompleted = false;
  const timeoutTimer = setTimeout(async () => {
    if (isCompleted) return; // 如果已完成就不处理超时
    console.log('⏰ Vercel函数即将超时，立即返回错误:', task_id);
    try {
      await taskManager.update(task_id, { 
        status: 'error', 
        error: 'Vercel函数执行超时，请稍后重试' 
      });
      console.log('✅ 超时错误状态已更新');
    } catch (error) {
      console.error('❌ 更新超时状态失败:', error);
    }
  }, vercelTimeout);
  
  // 测试 Redis 连接
  try {
    console.log('🔄 测试 Redis 连接...');
    await taskManager.update(task_id, { status: 'processing', progress: 10 });
    console.log('✅ Redis 连接成功');
  } catch (redisError) {
    console.error('❌ Redis 连接失败:', redisError);
    // 尝试最后一次更新，如果失败就放弃
    try {
      await taskManager.update(task_id, { 
        status: 'error', 
        error: 'Redis 数据库连接失败，请稍后重试' 
      });
    } catch (finalError) {
      console.error('❌ 最终Redis更新也失败了:', finalError);
    }
    isCompleted = true;
    clearTimeout(timeoutTimer);
    return;
  }

  // 定义API服务类型
  interface ApiService {
    name: string;
    url: string;
    method: 'GET' | 'POST';
    headers: Record<string, string>;
    params?: Record<string, string>;
    body?: string;
  }

  // 可用的第三方 API 服务
  const apiServices: ApiService[] = [
    {
      name: 'RapidAPI YT Downloader',
      url: 'https://youtube-mp36.p.rapidapi.com/dl',
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY || 'demo-key',
        'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      params: { id: videoId }
    },
    {
      name: 'Generic API',
      url: 'https://api.cobalt.tools/api/json',
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({
        url: url,
        vCodec: 'h264',
        vQuality: 'max',
        aFormat: 'mp3'
      })
    }
  ];

  // 尝试不同的 API 服务
  for (let i = 0; i < apiServices.length; i++) {
    const service = apiServices[i];
    
    try {
      console.log(`🔄 尝试 ${service.name}...`);
      await taskManager.update(task_id, { status: 'processing', progress: 20 + (i * 20) });
      
      const controller = new AbortController();
      const apiTimeout = 4000; // 增加到4秒 API 超时
      const timeoutId = setTimeout(() => {
        console.log(`⏰ ${service.name} API 超时`);
        controller.abort();
      }, apiTimeout);

      let response;
      if (service.method === 'POST') {
        response = await fetch(service.url, {
          method: 'POST',
          headers: service.headers,
          body: service.body,
          signal: controller.signal
        });
      } else {
        let requestUrl = service.url;
        if (service.params) {
          const params = new URLSearchParams(service.params);
          requestUrl += `?${params.toString()}`;
        }
        response = await fetch(requestUrl, {
          method: 'GET',
          headers: service.headers,
          signal: controller.signal
        });
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`📊 ${service.name} 响应状态:`, response.status);
      console.log(`📋 ${service.name} 响应数据:`, JSON.stringify(data, null, 2));
      
      // 解析不同 API 的响应格式
      const downloadUrl = parseAPIResponse(service.name, data);
      console.log(`🔗 ${service.name} 解析结果:`, downloadUrl);
      
      if (downloadUrl) {
        console.log(`✅ ${service.name} 成功获取下载链接`);
        
        // 下载音频文件
        await taskManager.update(task_id, { status: 'processing', progress: 70 });
        const audioData = await downloadAudio(downloadUrl);
        
        if (audioData) {
          console.log('✅ 音频下载完成');
          
          // 完成任务
          const file_url = `/api/download/${task_id}`;
          
          // 更新缓存
          urlCache.set(cacheKey, {
            file_url,
            created_at: Date.now()
          });
          
          await taskManager.update(task_id, {
            status: 'finished',
            file_url,
            progress: 100,
            audioBuffer: audioData,
            title: 'YouTube Audio'
          });
          
          console.log('🎉 API 转换成功完成!', file_url);
          isCompleted = true; // 标记已完成
          clearTimeout(timeoutTimer); // 清除超时定时器
          return;
        }
      }
      
    } catch (error) {
      console.warn(`❌ ${service.name} 失败:`, (error as Error).message);
      continue;
    }
  }
  
  // 所有API都失败了
  isCompleted = true; // 标记已完成
  clearTimeout(timeoutTimer); // 清除超时定时器
  console.error('💥 所有第三方API都失败了');
  console.log('📋 Error 时 task_id:', task_id);
  
  const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`⏱️ 总处理时间: ${processingTime}秒`);
  
  // 更好的错误信息
  console.log('🔄 返回API失败响应');
  await taskManager.update(task_id, {
    status: 'error',
    error: `所有第三方API都暂时不可用，请稍后重试。\n处理时间: ${processingTime}秒`
  });
}

// 解析API响应
function parseAPIResponse(serviceName: string, data: any): string | null {
  try {
    console.log(`🔍 解析 ${serviceName} 响应:`, JSON.stringify(data, null, 2));
    
    if (serviceName.includes('RapidAPI')) {
      // RapidAPI 响应格式
      if (data.status === 'ok' || data.status === 'success') {
        return data.link || data.url || data.download_url;
      }
    } else if (serviceName.includes('Generic')) {
      // Cobalt API 响应格式
      if (data.status === 'success' || data.status === 'stream') {
        return data.url || data.audio_url;
      }
    }
    
    // 通用解析 - 尝试常见字段
    const possibleUrls = [
      data.url,
      data.link, 
      data.download_url,
      data.audio_url,
      data.mp3_url,
      data.stream_url
    ];
    
    for (const url of possibleUrls) {
      if (url && typeof url === 'string' && url.startsWith('http')) {
        console.log('✅ 找到下载链接:', url);
        return url;
      }
    }
    
    return null;
  } catch (error) {
    console.error('解析API响应失败:', error);
    return null;
  }
}

// 下载音频文件
async function downloadAudio(downloadUrl: string): Promise<Buffer | null> {
  try {
    console.log('📥 开始下载音频:', downloadUrl);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2分钟超时
    
    const response = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
    
  } catch (error) {
    console.error('下载音频失败:', error);
    return null;
  }
}

// 智能 cookies 策略 - 尝试多种浏览器
async function tryWithDifferentBrowsers(baseCommand: string): Promise<string> {
  const browsers = ['chrome', 'firefox', 'safari', 'edge'];
  
  for (const browser of browsers) {
    try {
      console.log(`🔍 尝试使用 ${browser} cookies...`);
      const commandWithCookies = baseCommand.replace('--cookies-from-browser chrome', `--cookies-from-browser ${browser}`);
      const { stdout } = await execAsync(commandWithCookies, { 
        timeout: 30000,
        maxBuffer: 1024 * 1024 
      });
      console.log(`✅ ${browser} cookies 成功!`);
      return stdout;
    } catch (error) {
      console.warn(`❌ ${browser} cookies 失败:`, (error as Error).message);
      continue;
    }
  }
  
  // 如果所有浏览器都失败，尝试无 cookies
  console.log('🔄 所有浏览器 cookies 都失败，尝试无 cookies...');
  const commandWithoutCookies = baseCommand.replace('--cookies-from-browser chrome ', '');
  const { stdout } = await execAsync(commandWithoutCookies, { 
    timeout: 30000,
    maxBuffer: 1024 * 1024 
  });
  return stdout;
}

// 智能 cookies 策略 - 专用于下载（更长超时）
async function tryWithDifferentBrowsersForDownload(baseCommand: string): Promise<string> {
  const browsers = ['chrome', 'firefox', 'safari', 'edge'];
  
  for (const browser of browsers) {
    try {
      console.log(`🔍 尝试使用 ${browser} cookies 下载...`);
      const commandWithCookies = baseCommand.replace('--cookies-from-browser chrome', `--cookies-from-browser ${browser}`);
      const { stdout } = await execAsync(commandWithCookies, {
        timeout: 300000, // 5分钟超时
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
      console.log(`✅ ${browser} cookies 下载成功!`);
      return stdout;
    } catch (error) {
      console.warn(`❌ ${browser} cookies 下载失败:`, (error as Error).message);
      continue;
    }
  }
  
  // 如果所有浏览器都失败，尝试无 cookies
  console.log('🔄 所有浏览器 cookies 都失败，尝试无 cookies 下载...');
  const commandWithoutCookies = baseCommand.replace('--cookies-from-browser chrome ', '');
  const { stdout } = await execAsync(commandWithoutCookies, {
    timeout: 300000, // 5分钟超时
    maxBuffer: 10 * 1024 * 1024 // 10MB buffer
  });
  return stdout;
}

// 使用 yt-dlp 处理 (本地环境)
async function processWithYtDlp(task_id: string, url: string, cacheKey: string) {
  const videoId = extractVideoId(url);
  if (!videoId) {
    await taskManager.update(task_id, { status: 'error', error: '无法提取视频ID' });
    return;
  }

  console.log('🎯 本地环境：使用 yt-dlp 处理, 视频ID:', videoId);
  await taskManager.update(task_id, { status: 'processing', progress: 10 });

  // 创建临时目录
  const tempDir = os.tmpdir();
  const outputPath = path.join(tempDir, `ytdl_${task_id}`);
  
  try {
    // 确保输出目录存在
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    console.log('📁 临时目录:', outputPath);
    await taskManager.update(task_id, { status: 'processing', progress: 20 });

    // 第一步：获取视频信息（智能 cookies 策略）
    console.log('🔍 获取视频信息...');
    const infoCommand = `python3 -m yt_dlp --print title --print duration --cookies-from-browser chrome --no-check-certificate --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
    
    try {
      const infoOutput = await tryWithDifferentBrowsers(infoCommand);
      const lines = infoOutput.trim().split('\n');
      const title = lines[0] || 'Unknown Title';
      const duration = lines[1] || 'Unknown Duration';
      
      console.log('🎬 视频标题:', title);
      console.log('⏱️ 视频时长:', duration);
      
      await taskManager.update(task_id, { 
        status: 'processing', 
        progress: 40, 
        title: title 
      });
      
    } catch (infoError) {
      console.warn('⚠️ 获取视频信息失败，但继续处理:', (infoError as Error).message);
      await taskManager.update(task_id, { 
        status: 'processing', 
        progress: 40, 
        title: 'YouTube Audio' 
      });
    }

    // 第二步：下载音频
    console.log('🎵 开始下载音频...');
    await taskManager.update(task_id, { status: 'processing', progress: 50 });

    const outputTemplate = path.join(outputPath, '%(title)s.%(ext)s');
    const downloadCommand = `python3 -m yt_dlp -x --audio-format mp3 --audio-quality 192K --cookies-from-browser chrome --no-check-certificate --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -o "${outputTemplate}" "${url}"`;
    
    console.log('🔧 执行下载命令...');
    
    // 使用智能 cookies 策略下载
    const stdout = await tryWithDifferentBrowsersForDownload(downloadCommand);
    
    console.log('📥 yt-dlp 输出:', stdout);

    await taskManager.update(task_id, { status: 'processing', progress: 80 });

    // 第三步：找到下载的文件
    console.log('📂 查找下载的文件...');
    const files = fs.readdirSync(outputPath);
    const mp3Files = files.filter(f => f.endsWith('.mp3'));
    
    if (mp3Files.length === 0) {
      throw new Error('未找到下载的MP3文件');
    }
    
    const downloadedFile = path.join(outputPath, mp3Files[0]);
    console.log('📄 找到文件:', downloadedFile);
    
    // 第四步：读取文件到内存
    console.log('💾 读取文件到内存...');
    const audioBuffer = fs.readFileSync(downloadedFile);
    const fileSizeMB = (audioBuffer.length / 1024 / 1024).toFixed(2);
    
    console.log(`✅ 文件读取完成，大小: ${fileSizeMB}MB`);
    await taskManager.update(task_id, { status: 'processing', progress: 90 });

    // 清理临时文件
    try {
      fs.rmSync(outputPath, { recursive: true, force: true });
      console.log('🧹 临时文件清理完成');
    } catch (cleanupError) {
      console.warn('⚠️ 清理临时文件失败:', cleanupError);
    }

    // 完成任务
    const file_url = `/api/download/${task_id}`;
    const currentTask = await taskManager.get(task_id);
    const title = currentTask?.title || 'audio';
    
    // 更新缓存
    urlCache.set(cacheKey, {
      file_url,
      created_at: Date.now()
    });
    
    await taskManager.update(task_id, {
      status: 'finished',
      file_url,
      progress: 100,
      audioBuffer: audioBuffer,
      title: title
    });
    
    console.log('🎉 yt-dlp 转换成功完成!', file_url);
    
  } catch (error) {
    const errorMessage = (error as Error).message;
    console.error('💥 yt-dlp 处理失败:', errorMessage);
    
    // 清理临时文件
    try {
      if (fs.existsSync(outputPath)) {
        fs.rmSync(outputPath, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      console.warn('⚠️ 错误清理失败:', cleanupError);
    }
    
    // 解析错误类型
    let userFriendlyError = '转换失败，请稍后重试';
    
    if (errorMessage.includes('Video unavailable') || errorMessage.includes('Private video')) {
      userFriendlyError = '视频不可用或为私人视频';
    } else if (errorMessage.includes('This video is not available')) {
      userFriendlyError = '视频在您的地区不可用';
    } else if (errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT')) {
      userFriendlyError = '下载超时，视频可能过长或网络问题';
    } else if (errorMessage.includes('No such file or directory')) {
      userFriendlyError = '系统环境问题，请稍后重试';
    } else if (errorMessage.includes('HTTP Error 403') || errorMessage.includes('Forbidden')) {
      userFriendlyError = '访问被拒绝，可能是地区限制';
    }
    
    await taskManager.update(task_id, {
      status: 'error',
      error: userFriendlyError
    });
  }
}

// 缓存清理函数
function cleanupExpiredCache() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [key, value] of urlCache.entries()) {
    if (now - value.created_at > CACHE_DURATION) {
      urlCache.delete(key);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 清理了 ${cleanedCount} 个过期缓存项`);
  }
}
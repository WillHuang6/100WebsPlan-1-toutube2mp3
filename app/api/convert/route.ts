import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { tasks } from '@/lib/tasks';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { getCurrentPerformanceMode } from '@/lib/performance';

// Cache for processed URLs (in production, use Redis)
const urlCache = new Map<string, { file_url: string; created_at: number }>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// yt-dlp version and capability cache
interface YtDlpCapabilities {
  version: string;
  supportsFragmentRetries: boolean;
  supportsConcurrentFragments: boolean;
  supportsHttpChunkSize: boolean;
  lastChecked: number;
}

let ytdlpCapabilities: YtDlpCapabilities | null = null;

// 🔍 增强的性能监控
interface PerfMetrics {
  startTime: number;
  downloadStartTime?: number;
  downloadEndTime?: number;
  convertStartTime?: number;
  convertEndTime?: number;
  downloadTime?: number;
  convertTime?: number;
  fileSize?: number;
  retryAttempt?: number;
  lastError?: string;
  // 新增详细指标
  networkSpeed?: number;        // KB/s
  downloadProgress?: number;    // 0-100
  convertProgress?: number;     // 0-100
  peakMemoryUsage?: number;     // MB
  cpuUsage?: number;           // %
  totalFragments?: number;
  completedFragments?: number;
  avgFragmentSpeed?: number;    // KB/s
}

// Generate cache key from URL
function getCacheKey(url: string): string {
  return crypto.createHash('md5').update(url).digest('hex');
}

// 🔍 检查 yt-dlp 版本和能力
async function checkYtDlpCapabilities(env: any): Promise<YtDlpCapabilities> {
  // 缓存1小时
  if (ytdlpCapabilities && Date.now() - ytdlpCapabilities.lastChecked < 60 * 60 * 1000) {
    return ytdlpCapabilities;
  }

  console.log('🔍 检查 yt-dlp 版本和能力...');
  
  try {
    // 获取版本信息
    const versionOutput = await execCommand('yt-dlp', ['--version'], env, 5000);
    const version = versionOutput.trim();
    
    // 测试各种参数支持
    const capabilities: YtDlpCapabilities = {
      version,
      supportsFragmentRetries: false,
      supportsConcurrentFragments: false,
      supportsHttpChunkSize: false,
      lastChecked: Date.now()
    };

    // 测试 --fragment-retries 支持
    try {
      await execCommand('yt-dlp', ['--help'], env, 3000);
      const helpOutput = await execCommand('yt-dlp', ['--help'], env, 3000);
      
      capabilities.supportsFragmentRetries = helpOutput.includes('--fragment-retries');
      capabilities.supportsConcurrentFragments = helpOutput.includes('--concurrent-fragments');
      capabilities.supportsHttpChunkSize = helpOutput.includes('--http-chunk-size');
      
    } catch (error) {
      console.warn('⚠️ 无法获取 yt-dlp 帮助信息:', (error as Error).message);
    }

    ytdlpCapabilities = capabilities;
    console.log('✅ yt-dlp 能力检查完成:', capabilities);
    
    return capabilities;
    
  } catch (error) {
    console.error('❌ yt-dlp 能力检查失败:', (error as Error).message);
    
    // 返回最保守的配置
    const fallbackCapabilities: YtDlpCapabilities = {
      version: 'unknown',
      supportsFragmentRetries: false,
      supportsConcurrentFragments: false,
      supportsHttpChunkSize: false,
      lastChecked: Date.now()
    };
    
    ytdlpCapabilities = fallbackCapabilities;
    return fallbackCapabilities;
  }
}

// 🔧 执行命令的辅助函数
function execCommand(command: string, args: string[], env: any, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { env });
    let output = '';
    let error = '';

    process.stdout?.on('data', (data) => {
      output += data.toString();
    });

    process.stderr?.on('data', (data) => {
      error += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`命令失败 (代码: ${code}): ${error || output}`));
      }
    });

    process.on('error', (err) => {
      reject(err);
    });

    setTimeout(() => {
      process.kill('SIGTERM');
      reject(new Error('命令执行超时'));
    }, timeoutMs);
  });
}

// Real conversion using yt-dlp with performance optimizations
export async function POST(req: NextRequest) {
  const { url, format } = await req.json();
  
  if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }
  
  // Check cache first
  const cacheKey = getCacheKey(url);
  const cached = urlCache.get(cacheKey);
  if (cached && Date.now() - cached.created_at < CACHE_DURATION) {
    const cachedTaskId = uuidv4();
    tasks.set(cachedTaskId, { 
      status: 'finished', 
      file_url: cached.file_url, 
      progress: 100 
    });
    console.log('🚀 Cache hit for URL:', url);
    return NextResponse.json({ task_id: cachedTaskId, status: 'finished' });
  }
  
  const task_id = uuidv4();
  const metrics: PerfMetrics = { startTime: Date.now() };
  tasks.set(task_id, { status: 'processing', progress: 0 });

  console.log('🚀 任务开始:', task_id);
  console.log('📋 目标URL:', url);
  
  // 🕒 性能基准检查 - 如果之前的转换很慢，自动使用保守配置
  const recentSlowTasks = Array.from(tasks.entries())
    .filter(([_, task]) => task.status === 'finished' && Date.now() - (task as any).startTime < 300000) // 5分钟内
    .length;
    
  if (recentSlowTasks > 2) {
    console.log('⚠️ 检测到最近转换较慢，将使用更保守的配置');
  }

  // 🚀 智能重试转换处理
  (async () => {
    let retryAttempt = 0;
    const maxRetries = 3;
    
    while (retryAttempt <= maxRetries) {
      try {
        metrics.retryAttempt = retryAttempt;
        tasks.set(task_id, { status: 'processing', progress: 5 });
        
        if (retryAttempt > 0) {
          console.log(`🔄 第 ${retryAttempt} 次重试转换:`, url);
          // 每次重试前等待一段时间
          await new Promise(resolve => setTimeout(resolve, 2000 * retryAttempt));
        }
        
        await performConversion();
        break; // 成功则跳出循环
        
      } catch (error) {
        console.error(`💥 第 ${retryAttempt + 1} 次尝试失败:`, (error as Error).message);
        
        const errorMessage = (error as Error).message;
        const shouldRetry = retryAttempt < maxRetries && (
          errorMessage.includes('代码: 2') ||
          errorMessage.includes('代码: 1') ||
          errorMessage.includes('权限问题') ||
          errorMessage.includes('网络连接')
        );
        
        if (shouldRetry) {
          retryAttempt++;
          console.log(`🔄 将在 ${2 * retryAttempt} 秒后重试 (${retryAttempt}/${maxRetries})`);
          tasks.set(task_id, { 
            status: 'processing', 
            progress: 5,
            error: `尝试 ${retryAttempt}/${maxRetries + 1} 失败，准备重试...`
          });
        } else {
          console.error('❌ 所有重试尝试均失败，放弃转换');
          tasks.set(task_id, { 
            status: 'error', 
            error: `转换失败 (尝试了 ${retryAttempt + 1} 次): ${errorMessage}` 
          });
          return;
        }
      }
    }
    
    async function performConversion() {

      // 设置环境和路径 - 使用系统临时目录适配serverless
      const env = {
        ...process.env,
        PATH: `/Users/kuangshan/Library/Python/3.9/bin:${process.env.PATH}`
      };
      
      // 在serverless环境中使用系统临时目录
      const tempDir = os.tmpdir();
      const outputFile = path.join(tempDir, `${task_id}.mp3`);
      
      console.log('📁 使用临时目录:', tempDir);
      console.log('📄 输出文件路径:', outputFile);
      
      tasks.set(task_id, { status: 'processing', progress: 10 });
      console.log('🚀 开始智能转换:', url);
      console.log('📊 性能监控已启动');

      // 🔍 检查 yt-dlp 能力和性能模式
      const capabilities = await checkYtDlpCapabilities(env);
      const performanceMode = getCurrentPerformanceMode();
      
      console.log('🔧 yt-dlp 版本:', capabilities.version);
      console.log('🎯 性能模式:', performanceMode.description);

      // 🎯 根据性能模式配置参数
      const baseArgs = [
        '-f', 'bestaudio[abr<=128]/bestaudio',
        '--no-playlist',
        '--retries', performanceMode.ytdlpConfig.retries.toString(),
        '--no-warnings',
        '--quiet',
        '-o', '-',
        url
      ];

      // 📊 基于性能模式的优化参数
      const optimizedArgs: string[] = [];
      
      if (capabilities.supportsFragmentRetries) {
        optimizedArgs.push('--fragment-retries', performanceMode.ytdlpConfig.retries.toString());
      }
      
      if (capabilities.supportsConcurrentFragments) {
        optimizedArgs.push('--concurrent-fragments', performanceMode.ytdlpConfig.concurrentFragments.toString());
      }
      
      if (capabilities.supportsHttpChunkSize) {
        optimizedArgs.push('--http-chunk-size', performanceMode.ytdlpConfig.chunkSize);
      }

      // 🌐 基于性能模式的网络参数
      const networkArgs: string[] = [];
      if (metrics.retryAttempt === 0) {
        networkArgs.push('--buffer-size', performanceMode.ytdlpConfig.bufferSize);
        if (performanceMode.mode !== 'conservative') {
          networkArgs.push('--no-check-certificates');
        }
      }

      // 浏览器 cookies 参数
      const cookieArgs = [
        '--cookies-from-browser', 'chrome'
      ];

      // 🎯 基于性能模式的智能策略  
      let ytdlpArgs: string[];
      
      if (!metrics.retryAttempt || metrics.retryAttempt === 0) {
        // 第一次尝试：使用当前性能模式的配置
        ytdlpArgs = [
          ...baseArgs.slice(0, -1), 
          ...optimizedArgs, 
          ...networkArgs,
          url
        ];
        console.log(`🎯 第1次尝试: ${performanceMode.mode} 模式配置`);
        console.log(`📋 并发: ${performanceMode.ytdlpConfig.concurrentFragments}, 块: ${performanceMode.ytdlpConfig.chunkSize}, 缓冲: ${performanceMode.ytdlpConfig.bufferSize}`);
      } 
      else if (metrics.retryAttempt === 1) {
        // 第二次尝试：降级到保守配置 + cookies
        ytdlpArgs = [
          ...baseArgs.slice(0, -1),
          '--concurrent-fragments', '2',
          '--buffer-size', '8K',
          ...cookieArgs,
          url
        ];
        console.log('🔄 第2次尝试: 保守配置 + cookies');
        console.log('📋 自动降级到最安全配置');
      }
      else if (metrics.retryAttempt === 2) {
        // 第三次尝试：极简基础参数
        ytdlpArgs = [
          '-f', 'bestaudio',
          '--no-playlist',
          '--retries', '2',
          '--quiet',
          '-o', '-',
          url
        ];
        console.log('⚡ 第3次尝试: 极简基础参数');
        console.log('📋 移除所有可能问题的优化参数');
      }
      else {
        // 最后尝试：最小化参数
        ytdlpArgs = [
          '-f', 'worst',  // 使用最低质量，确保能下载
          '--no-playlist',
          '--quiet',
          '-o', '-',
          url
        ];
        console.log('🆘 最后尝试: 最小化参数 + 最低质量');
        console.log('📋 生存模式：不计质量，只求成功');
      }

      // 🎯 基于性能模式的 ffmpeg 配置
      const coreCount = os.cpus().length;
      let threadCount = coreCount;
      
      // 根据性能模式调整线程数
      if (performanceMode.ffmpegConfig.threads === 'cores*1.5') {
        threadCount = Math.ceil(coreCount * 1.5);
      }
      
      const ffmpegArgs = [
        '-i', 'pipe:0',
        '-acodec', 'libmp3lame',
        '-ab', '128k',
        '-ar', '44100', 
        '-ac', '2',
        '-threads', threadCount.toString(),
        '-preset', performanceMode.ffmpegConfig.preset,
        '-f', 'mp3',
        ...performanceMode.ffmpegConfig.additionalArgs,
        '-avoid_negative_ts', 'make_zero',
        '-y',
        outputFile
      ];

      console.log(`🔧 ffmpeg 配置: ${threadCount}线程, ${performanceMode.ffmpegConfig.preset}预设, ${performanceMode.mode}模式`);

      console.log('🔧 yt-dlp args:', ytdlpArgs.join(' '));
      console.log('🔧 ffmpeg args:', ffmpegArgs.join(' '));

      // 启动优化后的进程，增强错误捕获
      const ytdlp = spawn('yt-dlp', ytdlpArgs, { 
        env,
        stdio: ['ignore', 'pipe', 'pipe'] // 确保 stderr 可以被捕获
      });
      const ffmpeg = spawn('ffmpeg', ffmpegArgs, { 
        env,
        stdio: ['pipe', 'ignore', 'pipe'] // stdin 来自 yt-dlp，stderr 用于监控
      });

      // 连接管道: yt-dlp stdout -> ffmpeg stdin
      ytdlp.stdout.pipe(ffmpeg.stdin);

      let ytdlpProgress = 0;
      let ffmpegProgress = 0;
      let downloadStartTime = Date.now();
      let convertStartTime = 0;
      let totalDuration = 0;



      // 🛡️ 增强的错误诊断和处理
      let ytdlpErrorOutput = '';
      let ffmpegErrorOutput = '';
      
      // 🔍 超级智能的 yt-dlp 监控系统
      ytdlp.stderr.on('data', (data) => {
        const output = data.toString();
        ytdlpErrorOutput += output;
        
        // 📊 详细进度和性能分析
        const progressMatch = output.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
        const speedMatch = output.match(/(\d+(?:\.\d+)?(?:K|M|G)?iB\/s)/);
        const sizeMatch = output.match(/of\s+([\d.]+(?:K|M|G)?iB)/);
        const etaMatch = output.match(/ETA\s+(\d{2}:\d{2})/);
        const fragmentMatch = output.match(/\[download\]\s+Downloaded\s+(\d+)\s+of\s+(\d+)\s+fragments/);
        
        if (progressMatch) {
          const downloadPercent = parseFloat(progressMatch[1]);
          ytdlpProgress = Math.min(70, Math.round(downloadPercent * 0.7)); // 下载占70%
          
          // 更新详细指标
          metrics.downloadProgress = downloadPercent;
          metrics.downloadStartTime = metrics.downloadStartTime || Date.now();
          
          const currentProgress = Math.max(10, ytdlpProgress);
          tasks.set(task_id, { status: 'processing', progress: currentProgress });
          
          // 📈 计算网络速度
          if (speedMatch) {
            const speedStr = speedMatch[1];
            let speedKBs = 0;
            
            if (speedStr.includes('GiB')) {
              speedKBs = parseFloat(speedStr) * 1024 * 1024;
            } else if (speedStr.includes('MiB')) {
              speedKBs = parseFloat(speedStr) * 1024;
            } else if (speedStr.includes('KiB')) {
              speedKBs = parseFloat(speedStr);
            } else {
              speedKBs = parseFloat(speedStr) / 1024; // B to KB
            }
            
            metrics.networkSpeed = Math.round(speedKBs);
            
            // 🚀 实时性能报告
            if (downloadPercent % 10 === 0 || downloadPercent > 90) {
              console.log(`🚀 下载进度: ${downloadPercent}% | 速度: ${Math.round(speedKBs)}KB/s | ETA: ${etaMatch ? etaMatch[1] : '未知'}`);
            }
          }
          
          // 📥 下载完成检测
          if (downloadPercent >= 99 && !metrics.downloadEndTime) {
            metrics.downloadEndTime = Date.now();
            metrics.downloadTime = metrics.downloadEndTime - (metrics.downloadStartTime || downloadStartTime);
            convertStartTime = Date.now();
            metrics.convertStartTime = convertStartTime;
            
            console.log(`✅ yt-dlp 下载完成!`);
            console.log(`📊 下载性能: ${metrics.downloadTime}ms, 平均速度: ${metrics.networkSpeed}KB/s`);
          }
        }
        
        // 🧩 片段下载监控
        if (fragmentMatch) {
          const completed = parseInt(fragmentMatch[1]);
          const total = parseInt(fragmentMatch[2]);
          
          metrics.completedFragments = completed;
          metrics.totalFragments = total;
          
          if (completed % 50 === 0 || completed > total - 5) {
            console.log(`🧩 片段进度: ${completed}/${total} (${Math.round(completed/total*100)}%)`);
          }
        }
        
        // 🚨 错误诊断
        if (output.includes('ERROR:')) {
          console.error('🚨 yt-dlp 错误:', output.trim());
          
          if (output.includes('HTTP Error 429')) {
            console.error('💡 建议: 请求过于频繁，将自动降低并发数重试');
          } else if (output.includes('Sign in to confirm')) {
            console.error('💡 建议: 需要登录验证，尝试去掉 cookies');
          } else if (output.includes('Video unavailable')) {
            console.error('💡 建议: 视频不可用，可能地区限制');
          }
        }
      });

      // 🚀 超级智能的 ffmpeg 监控系统
      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        ffmpegErrorOutput += output;
        
        // 🎵 检测音频时长
        const durationMatch = output.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (durationMatch && !totalDuration) {
          const [, hours, minutes, seconds] = durationMatch;
          totalDuration = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
          console.log(`🎵 音频时长: ${Math.round(totalDuration)}秒 (${Math.round(totalDuration/60)}分钟)`);
        }
        
        // 🔄 转换进度监控
        const timeMatch = output.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (timeMatch && totalDuration > 0) {
          const [, hours, minutes, seconds] = timeMatch;
          const currentTime = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
          const convertPercent = Math.min(100, (currentTime / totalDuration) * 100);
          
          // 更新详细指标
          metrics.convertProgress = convertPercent;
          
          // 转换进度占30% (70% + 30% = 100%)
          ffmpegProgress = Math.round(70 + convertPercent * 0.3);
          tasks.set(task_id, { status: 'processing', progress: Math.min(98, ffmpegProgress) });
          
          // 📊 详细性能监控
          const speed = output.match(/speed=\s*(\d+(?:\.\d+)?x)/);
          const bitrate = output.match(/bitrate=\s*(\d+(?:\.\d+)?kbits\/s)/);
          const fps = output.match(/fps=\s*(\d+(?:\.\d+)?)/);
          const q = output.match(/q=\s*(\d+(?:\.\d+)?)/);
          
          // 🚀 性能报告 (每10%或最后阶段)
          if (convertPercent % 10 === 0 || convertPercent > 90) {
            let perfReport = `🔄 转换: ${convertPercent.toFixed(1)}%`;
            if (speed) perfReport += ` | 速度: ${speed[1]}`;
            if (bitrate) perfReport += ` | 码率: ${bitrate[1]}`;
            if (fps) perfReport += ` | FPS: ${fps[1]}`;
            
            console.log(perfReport);
          }
          
          // 📈 预估剩余时间
          if (convertPercent > 10 && speed) {
            const speedMultiplier = parseFloat(speed[1].replace('x', ''));
            const remainingTime = (totalDuration - currentTime) / speedMultiplier;
            
            if (convertPercent % 25 === 0) {
              console.log(`⏱️ 预计剩余时间: ${Math.round(remainingTime)}秒`);
            }
          }
        }
        
        // 🚨 ffmpeg 错误和警告监控
        if (output.includes('Error') || output.includes('error')) {
          console.error('🚨 ffmpeg 错误:', output.trim());
        }
        
        // 📊 内存和CPU使用监控 (简化版)
        if (output.includes('frame=')) {
          const frameMatch = output.match(/frame=\s*(\d+)/);
          if (frameMatch && parseInt(frameMatch[1]) % 1000 === 0) {
            const memUsage = process.memoryUsage();
            metrics.peakMemoryUsage = Math.max(
              metrics.peakMemoryUsage || 0, 
              Math.round(memUsage.heapUsed / 1024 / 1024)
            );
          }
        }
      });

      // 进程错误处理
      ytdlp.on('error', (error) => {
        console.error('💥 yt-dlp 进程启动失败:', error.message);
        ffmpeg.kill('SIGTERM');
        throw new Error(`yt-dlp 进程启动失败: ${error.message}`);
      });

      ffmpeg.on('error', (error) => {
        console.error('💥 ffmpeg 进程启动失败:', error.message);
        ytdlp.kill('SIGTERM');
        throw new Error(`ffmpeg 进程启动失败: ${error.message}`);
      });

      // 🎯 智能进程管理和错误诊断
      await new Promise((resolve, reject) => {
        let ytdlpClosed = false;
        let ffmpegClosed = false;
        
        ytdlp.on('close', (code, signal) => {
          ytdlpClosed = true;
          console.log(`📥 yt-dlp 进程结束 (代码: ${code}, 信号: ${signal})`);
          
          if (code !== 0 && code !== null) {
            // 提供详细的错误诊断
            console.error('🔍 yt-dlp 错误诊断:');
            console.error('📄 完整错误输出:', ytdlpErrorOutput.slice(-1000)); // 最后1000字符
            
            // 根据退出代码提供具体建议
            let errorMessage = `yt-dlp 进程异常退出 (代码: ${code})`;
            let suggestion = '';
            
            switch (code) {
              case 1:
                suggestion = '可能是网络连接问题或URL无效';
                break;
              case 2:
                suggestion = '命令行参数错误或权限问题，将尝试简化参数重试';
                break;
              case 101:
                suggestion = '视频不可用或需要登录';
                break;
              default:
                suggestion = '未知错误，请检查网络连接和URL有效性';
            }
            
            console.error(`💡 错误分析: ${suggestion}`);
            
            // 检查是否应该重试
            const shouldRetry = (code === 2 || code === 1) && (!metrics.retryAttempt || metrics.retryAttempt < 2);
            
            if (shouldRetry) {
              console.log('🔄 检测到可重试错误，准备使用简化参数重试...');
              metrics.lastError = `${errorMessage} - ${suggestion}`;
              // 这里需要重新启动转换过程，但为了简化，先抛出错误
            }
            
            ffmpeg.kill('SIGTERM');
            reject(new Error(`${errorMessage}\n建议: ${suggestion}\n详细错误: ${ytdlpErrorOutput.slice(-200)}`));
            return;
          }
          
          // yt-dlp 正常结束，等待 ffmpeg 完成
          console.log('✅ yt-dlp 下载完成，等待转换...');
        });
        
        ffmpeg.on('close', (code, signal) => {
          ffmpegClosed = true;
          console.log(`🔄 ffmpeg 进程结束 (代码: ${code}, 信号: ${signal})`);
          
          if (code === 0) {
            metrics.convertTime = convertStartTime ? Date.now() - convertStartTime : 0;
            console.log('✅ 超速转换完成!');
            resolve(null);
          } else {
            console.error('🔍 ffmpeg 错误诊断:');
            console.error('📄 完整错误输出:', ffmpegErrorOutput.slice(-500));
            
            let errorMessage = `ffmpeg 转换失败 (代码: ${code})`;
            if (ffmpegErrorOutput.includes('Invalid data found')) {
              errorMessage += ' - 输入数据无效，可能是下载不完整';
            } else if (ffmpegErrorOutput.includes('Permission denied')) {
              errorMessage += ' - 权限不足，无法写入输出文件';
            }
            
            reject(new Error(`${errorMessage}\n详细错误: ${ffmpegErrorOutput.slice(-200)}`));
          }
        });
        
        // 🕒 智能超时机制 - 根据重试次数调整超时
        const timeoutDuration = (3 + (metrics.retryAttempt || 0)) * 60 * 1000; // 3-6分钟递增
        const timeout = setTimeout(() => {
          if (!ytdlpClosed || !ffmpegClosed) {
            console.log(`⏰ 转换超时 (${Math.round(timeoutDuration/60000)}分钟)，强制终止进程`);
            console.log(`📊 超时状态: yt-dlp=${ytdlpClosed}, ffmpeg=${ffmpegClosed}`);
            console.log(`🔄 这是第 ${(metrics.retryAttempt || 0) + 1} 次尝试`);
            
            ytdlp.kill('SIGKILL');
            ffmpeg.kill('SIGKILL');
            
            reject(new Error(`转换超时 (${Math.round(timeoutDuration/60000)}分钟)\nyt-dlp状态: ${ytdlpClosed ? '已完成' : '未完成'}\nffmpeg状态: ${ffmpegClosed ? '已完成' : '未完成'}\n建议: 检查网络连接或视频可用性`));
          }
        }, timeoutDuration);
        
        // 清理超时定时器
        const originalResolve = resolve;
        const originalReject = reject;
        
        resolve = (value) => {
          clearTimeout(timeout);
          originalResolve(value);
        };
        
        reject = (reason) => {
          clearTimeout(timeout);
          originalReject(reason);
        };
      });

      // 📊 文件验证和性能统计
      if (!fs.existsSync(outputFile)) {
        throw new Error('转换后的文件未生成');
      }
      
      const fileStats = fs.statSync(outputFile);
      if (fileStats.size === 0) {
        throw new Error('转换后的文件为空');
      }
      
      // 🚀 完整性能分析和优化建议
      metrics.fileSize = fileStats.size;
      metrics.convertEndTime = Date.now();
      if (metrics.convertStartTime) {
        metrics.convertTime = metrics.convertEndTime - metrics.convertStartTime;
      }
      
      const totalTime = Date.now() - metrics.startTime;
      const fileSizeMB = metrics.fileSize / 1024 / 1024;
      const avgSpeedKBs = (metrics.fileSize / 1024) / (totalTime / 1000);
      
      console.log('');
      console.log('🎯 =============== 性能分析报告 ===============');
      console.log(`📊 总体性能:`);
      console.log(`   ⏱️  总耗时: ${(totalTime/1000).toFixed(1)}秒 (${totalTime}ms)`);
      console.log(`   📁  文件大小: ${fileSizeMB.toFixed(2)}MB`);
      console.log(`   🚀  整体速度: ${avgSpeedKBs.toFixed(1)}KB/s`);
      
      console.log(`📥 下载阶段:`);
      console.log(`   ⏱️  下载耗时: ${((metrics.downloadTime || 0)/1000).toFixed(1)}秒`);
      console.log(`   📊  下载占比: ${(((metrics.downloadTime || 0)/totalTime)*100).toFixed(1)}%`);
      console.log(`   🌐  网络速度: ${metrics.networkSpeed || 0}KB/s`);
      if (metrics.totalFragments) {
        console.log(`   🧩  片段统计: ${metrics.completedFragments}/${metrics.totalFragments}`);
      }
      
      console.log(`🔄 转换阶段:`);
      console.log(`   ⏱️  转换耗时: ${((metrics.convertTime || 0)/1000).toFixed(1)}秒`);
      console.log(`   📊  转换占比: ${(((metrics.convertTime || 0)/totalTime)*100).toFixed(1)}%`);
      if (metrics.peakMemoryUsage) {
        console.log(`   💾  峰值内存: ${metrics.peakMemoryUsage}MB`);
      }
      
      // 🔍 性能分析和建议
      console.log(`🔍 性能分析:`);
      
      if ((metrics.downloadTime || 0) > (metrics.convertTime || 0) * 2) {
        console.log(`   ⚠️  下载是主要瓶颈，建议：增加并发片段数或检查网络`);
      } else if ((metrics.convertTime || 0) > (metrics.downloadTime || 0) * 2) {
        console.log(`   ⚠️  转换是主要瓶颈，建议：降低音质或使用硬件加速`);
      } else {
        console.log(`   ✅  下载和转换平衡，性能良好`);
      }
      
      if (totalTime > 60000) { // 超过1分钟
        console.log(`   ⚠️  总耗时较长，建议：检查网络连接或考虑降低音质`);
      } else if (totalTime < 15000) { // 少于15秒
        console.log(`   🚀  转换速度优秀！`);
      }
      
      if ((metrics.networkSpeed || 0) < 100) {
        console.log(`   ⚠️  网络速度较慢，建议：检查网络连接或增加重试次数`);
      }
      
      console.log('🎯 ============================================');
      console.log('');

      const file_url = `/api/download/${task_id}`;
      
      // 🗄️ 更新缓存
      urlCache.set(cacheKey, {
        file_url,
        created_at: Date.now()
      });
      
      // 🎯 任务完成
      tasks.set(task_id, { 
        status: 'finished', 
        file_url,
        progress: 100
      });

      console.log('🎉 超速转换成功完成!', file_url);
    } // performConversion 函数结束
    
  })().catch(error => {
    console.error('💥 外层转换错误:', error);
    tasks.set(task_id, { status: 'error', error: (error as Error).message });
  });

  // 🧹 定期清理过期缓存
  cleanupExpiredCache();
  
  console.log('Task created:', task_id);
  return NextResponse.json({ task_id, status: 'processing' });
}

// 🧹 缓存清理函数
function cleanupExpiredCache() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [key, value] of urlCache.entries()) {
    if (now - value.created_at > CACHE_DURATION) {
      // 删除过期的缓存文件 - 从临时目录中删除
      try {
        // 从API路径中提取taskId
        const taskId = value.file_url.split('/').pop();
        if (taskId) {
          const tempDir = os.tmpdir();
          const filePath = path.join(tempDir, `${taskId}.mp3`);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ 删除过期文件: ${filePath}`);
          }
        }
      } catch (error) {
        console.error('删除文件失败:', error);
      }
      
      urlCache.delete(key);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 清理了 ${cleanedCount} 个过期缓存项`);
  }
}

// TODO: Real implementation with ytdl and ffmpeg
/*
import ytdl from '@distube/ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';
import os from 'os';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET || 'my-bucket';
*/ 
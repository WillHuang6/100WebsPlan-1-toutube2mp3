'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  useEffect(() => {
    // 追踪404错误 - 增加安全检查
    try {
      if (typeof window !== 'undefined' && 
          (window as any).gtag && 
          typeof (window as any).gtag === 'function') {
        (window as any).gtag('event', 'page_not_found', {
          event_category: 'Error',
          event_label: window.location.pathname,
          error_type: '404_error',
          referrer: document.referrer || 'direct',
        });
      }
    } catch (error) {
      console.warn('404页面GA追踪失败:', error);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50 flex items-center justify-center">
      <div className="text-center px-4">
        <div className="mb-8">
          <h1 className="text-9xl font-bold text-gray-300 mb-4">404</h1>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            页面未找到
          </h2>
          <p className="text-xl text-gray-600 mb-8 max-w-md mx-auto">
            抱歉，您访问的页面不存在。可能是链接错误或页面已被删除。
          </p>
        </div>

        <div className="space-y-4">
          <Link href="/">
            <Button className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-xl text-lg font-semibold">
              🏠 返回首页
            </Button>
          </Link>
          
          <div className="mt-8 p-6 bg-white rounded-xl shadow-lg max-w-md mx-auto">
            <h3 className="text-lg font-semibold mb-3 text-gray-900">
              🎵 立即转换YouTube视频
            </h3>
            <p className="text-gray-600 mb-4">
              免费将YouTube视频转换为高质量MP3音频文件
            </p>
            <Link href="/">
              <Button variant="outline" className="w-full">
                开始转换
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
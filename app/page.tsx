'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function Home() {
  const [url, setUrl] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'converting' | 'finished' | 'error'>('idle');
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const handleConvert = async () => {
    if (!url.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    setStatus('converting');
    setError(null);
    setFileUrl(null);
    
    try {
      const convertRes = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, format: 'mp3' }),
      });
      if (!convertRes.ok) throw new Error((await convertRes.json()).error);
      const { task_id } = await convertRes.json();
      setTaskId(task_id);
      pollStatus(task_id);
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  };

  const pollStatus = async (id: string) => {
    const res = await fetch(`/api/status/${id}`);
    if (!res.ok) return setError('Failed to get status');
    const { status: taskStatus, file_url, progress } = await res.json();
    setProgress(progress || 0);
    if (taskStatus === 'finished') {
      setFileUrl(file_url);
      setStatus('finished');
    } else if (taskStatus === 'error') {
      setError('Conversion failed');
      setStatus('error');
    } else {
      setTimeout(() => pollStatus(id), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50">
      {/* Header */}
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-6">
            Convert YouTube to MP3
          </h1>
          <h2 className="text-3xl md:text-4xl font-semibold mb-6 text-gray-700">
            Free Online <span className="text-blue-900">YouTube to MP3 Converter</span>
          </h2>
          <p className="text-xl text-gray-600 mb-4 max-w-4xl mx-auto">
            Easily convert YouTube to MP3 with our powerful and free online YouTube to MP3 converter. 
            Download high-quality MP3 audio from any YouTube video in seconds.
          </p>
          <p className="text-lg text-gray-600 max-w-4xl mx-auto">
            No registration required. Simply paste your YouTube URL and convert YouTube to MP3 instantly. 
            Perfect for music lovers, content creators, and anyone who wants to extract audio from YouTube videos.
          </p>
        </div>

        {/* Main Converter */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1">
                <Input
                  type="text"
                  placeholder="https://youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="h-14 text-lg border-2 border-gray-200 focus:border-orange-500 rounded-xl"
                />
              </div>
              <Button 
                onClick={handleConvert} 
                disabled={status === 'converting'}
                className="h-14 px-8 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl text-lg"
              >
                {status === 'converting' ? 'Converting...' : '🎵 Convert to MP3'}
              </Button>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {status === 'converting' && (
              <div className="mb-6">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Converting your video...</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            {status === 'finished' && fileUrl && (
              <div className="border-2 border-green-200 bg-green-50 rounded-xl p-6">
                <div className="text-center mb-4">
                  <h3 className="text-xl font-semibold text-green-800 mb-2">✅ Conversion Complete!</h3>
                  <p className="text-green-600">Your MP3 is ready for download</p>
                </div>
                
                <audio controls src={fileUrl} className="w-full mb-4" />
                
                <a href={fileUrl} download className="block">
                  <Button className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl">
                    📥 Download MP3
                  </Button>
                </a>
                
                <p className="text-sm text-gray-500 text-center mt-3">
                  File expires in 24 hours
                </p>
              </div>
            )}
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-8 text-center mb-12">
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="text-4xl mb-4">⚡</div>
              <h3 className="text-xl font-semibold mb-2">Lightning Fast Conversion</h3>
              <p className="text-gray-600">Our YouTube to MP3 converter processes videos in seconds. Convert YouTube to MP3 with lightning speed using our optimized servers.</p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="text-4xl mb-4">🎵</div>
              <h3 className="text-xl font-semibold mb-2">Premium Audio Quality</h3>
              <p className="text-gray-600">Extract high-quality MP3 audio from YouTube videos. Our converter maintains the original audio quality when you convert YouTube to MP3.</p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="text-4xl mb-4">🔒</div>
              <h3 className="text-xl font-semibold mb-2">100% Safe & Secure</h3>
              <p className="text-gray-600">Your privacy matters. All files are processed securely and automatically deleted after 24 hours for maximum security.</p>
            </div>
          </div>

          {/* How to Use Section */}
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-12">
            <h2 className="text-3xl font-bold text-center mb-8 text-gray-900">How to Convert YouTube to MP3</h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-blue-600">1</span>
                </div>
                <h3 className="text-xl font-semibold mb-2">Paste YouTube URL</h3>
                <p className="text-gray-600">Copy the YouTube video URL you want to convert to MP3 and paste it in our YouTube to MP3 converter above.</p>
              </div>
              <div className="text-center">
                <div className="bg-orange-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-orange-600">2</span>
                </div>
                <h3 className="text-xl font-semibold mb-2">Click Convert</h3>
                <p className="text-gray-600">Press the convert button and our system will instantly start to convert YouTube to MP3 format with high quality.</p>
              </div>
              <div className="text-center">
                <div className="bg-green-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-green-600">3</span>
                </div>
                <h3 className="text-xl font-semibold mb-2">Download MP3</h3>
                <p className="text-gray-600">Once the conversion is complete, download your MP3 file directly to your device. It's that simple!</p>
              </div>
            </div>
          </div>

          {/* Why Choose Us Section */}
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-12">
            <h2 className="text-3xl font-bold text-center mb-8 text-gray-900">Why Choose Our YouTube to MP3 Converter?</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-semibold mb-3 text-gray-900">🚀 No Software Installation</h3>
                <p className="text-gray-600 mb-4">Our online YouTube to MP3 converter works directly in your browser. No need to download or install any software to convert YouTube to MP3.</p>
                
                <h3 className="text-xl font-semibold mb-3 text-gray-900">💰 Completely Free</h3>
                <p className="text-gray-600 mb-4">Convert YouTube to MP3 for free with unlimited conversions. No hidden fees, no premium accounts required.</p>
                
                <h3 className="text-xl font-semibold mb-3 text-gray-900">📱 All Devices Supported</h3>
                <p className="text-gray-600">Use our YouTube to MP3 converter on any device - desktop, mobile, or tablet. Works on all operating systems.</p>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-3 text-gray-900">🎯 No Registration Required</h3>
                <p className="text-gray-600 mb-4">Start using our YouTube to MP3 converter immediately. No account creation, no email verification needed.</p>
                
                <h3 className="text-xl font-semibold mb-3 text-gray-900">⚡ Super Fast Processing</h3>
                <p className="text-gray-600 mb-4">Our powerful servers ensure quick processing when you convert YouTube to MP3. Most conversions complete in under 30 seconds.</p>
                
                <h3 className="text-xl font-semibold mb-3 text-gray-900">🔄 Unlimited Conversions</h3>
                <p className="text-gray-600">Convert as many YouTube videos to MP3 as you want. No daily limits or restrictions on our YouTube to MP3 converter.</p>
              </div>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-3xl font-bold text-center mb-8 text-gray-900">Frequently Asked Questions</h2>
            <div className="space-y-6">
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-xl font-semibold mb-3 text-gray-900">Is it legal to convert YouTube to MP3?</h3>
                <p className="text-gray-600">Converting YouTube videos to MP3 for personal use is generally acceptable. However, always respect copyright laws and only convert YouTube to MP3 for content you own or have permission to use.</p>
              </div>
              
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-xl font-semibold mb-3 text-gray-900">What quality MP3 files does your YouTube to MP3 converter produce?</h3>
                <p className="text-gray-600">Our YouTube to MP3 converter extracts audio at the highest quality available from the original YouTube video, typically up to 320kbps MP3 format for the best listening experience.</p>
              </div>
              
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-xl font-semibold mb-3 text-gray-900">How long does it take to convert YouTube to MP3?</h3>
                <p className="text-gray-600">Most YouTube to MP3 conversions complete within 15-30 seconds, depending on the video length. Our optimized servers ensure fast processing when you convert YouTube to MP3.</p>
              </div>
              
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-xl font-semibold mb-3 text-gray-900">Do I need to install software to use this YouTube to MP3 converter?</h3>
                <p className="text-gray-600">No installation required! Our YouTube to MP3 converter works entirely online in your web browser. Simply visit our site and convert YouTube to MP3 instantly.</p>
              </div>
              
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-xl font-semibold mb-3 text-gray-900">Is there a limit to how many videos I can convert to MP3?</h3>
                <p className="text-gray-600">No limits! Use our YouTube to MP3 converter as many times as you want. Convert unlimited YouTube videos to MP3 format for free.</p>
              </div>
              
              <div>
                <h3 className="text-xl font-semibold mb-3 text-gray-900">What happens to my files after I convert YouTube to MP3?</h3>
                <p className="text-gray-600">For your privacy and security, all MP3 files are automatically deleted from our servers after 24 hours. We recommend downloading your converted files immediately after using our YouTube to MP3 converter.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

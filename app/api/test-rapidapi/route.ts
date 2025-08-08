import { NextResponse } from 'next/server';

export async function GET() {
  try {
    if (!process.env.RAPIDAPI_KEY) {
      return NextResponse.json({ error: 'RAPIDAPI_KEY not configured' }, { status: 500 });
    }

    const testVideoId = 'nR5MvP9WFS0';
    const apiUrl = `https://youtube-mp36.p.rapidapi.com/dl?id=${testVideoId}`;

    console.log('Testing RapidAPI with URL:', apiUrl);
    console.log('API Key exists:', !!process.env.RAPIDAPI_KEY);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    console.log('RapidAPI response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('RapidAPI error response:', errorText);
      return NextResponse.json({
        error: 'RapidAPI call failed',
        status: response.status,
        response: errorText
      }, { status: 500 });
    }

    const data = await response.json();
    console.log('RapidAPI success response:', data);

    return NextResponse.json({
      success: true,
      status: response.status,
      data: data
    });

  } catch (error) {
    console.error('RapidAPI test error:', error);
    return NextResponse.json({
      error: 'Test failed',
      details: (error as Error).message
    }, { status: 500 });
  }
}
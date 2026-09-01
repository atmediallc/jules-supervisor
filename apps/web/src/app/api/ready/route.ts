import { NextResponse } from 'next/server';
import { getDatabase } from '@jules/db';
import { getConfig } from '@jules/config';

export async function GET() {
  try {
    const config = getConfig();
    const db = getDatabase(config.DATABASE_URL);
    await db.execute('SELECT 1');
    return NextResponse.json({ ready: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ready: false }, { status: 503 });
  }
}
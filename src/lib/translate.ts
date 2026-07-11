import { supabase } from './supabase'

export async function translateTexts(texts: string[]): Promise<string[]> {
  if (!texts.length) return []

  const { data, error } = await supabase.functions.invoke('translate', {
    body: { texts },
  })

  if (error || !data?.translations) {
    console.error('Translation failed:', error)
    return texts
  }

  return data.translations as string[]
}

import { createClient } from '@supabase/supabase-js'

// Proyecto: elaceroapp
// La URL y la "publishable key" son PÚBLICAS por diseño (seguras de exponer en el
// cliente). La protección real de los datos vive en las políticas RLS + el login.
const SUPABASE_URL = 'https://vzsufuolvfaiykzjapyt.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_MnqMl66H7VOG76hAbRHkng_WTurBdS6'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

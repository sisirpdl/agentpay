import { supabase } from './db'

async function test() {
  console.log("Testing connection...")
  
  // Try to insert a fake contact
  const { data, error } = await supabase
    .from('contacts')
    .insert([
      { 
        user_id: 'test_user_123', 
        name: 'Test Bob', 
        address: '0x123456789' 
      },
    ])
    .select()

  if (error) console.error("Error:", error)
  else console.log("Success! Added:", data)
}

test()
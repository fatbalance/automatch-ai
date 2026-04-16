export default async function handler(req,res){
if(req.method!=="POST")return res.status(405).json({error:"Method not allowed. Use POST."});
try{
if(!process.env.GROQ_API_KEY)return res.status(500).json({error:"Missing GROQ_API_KEY",hint:"Set GROQ_API_KEY in Vercel env."});
const body=req.body||{},cars=Array.isArray(body.cars)?body.cars.map(String).filter(Boolean):[];
if(cars.length<2)return res.status(400).json({error:"Provide at least 2 cars to compare."});
const context=body.context||{},budget=(context.budget??"").toString().trim(),budgetType=(context.budgetType??"").toString().trim();
const picks=Array.isArray(context.picks)?context.picks.map(String):[];
const model="llama-3.3-70b-versatile";
const systemPrompt=`You are a UK car expert. Return ONLY valid JSON. No markdown, no explanation, no extra text.

Given a list of cars, provide a side-by-side comparison with real UK market data. Use typical used-car prices and specs for common trim levels. Be accurate and practical.`;
const userPrompt=[`Compare these cars for the UK market: ${cars.join(", ")}`,budget&&`User's budget context: ${budget}${budgetType?` (${budgetType})`:""}`,picks.length&&`User cares about: ${picks.join(", ")}`,"","Return a JSON object with this exact structure:",'{"cars":[{"name":"Exact car name as given","price":"e.g. £18,000–£22,000 used","mpg":"e.g. 45–52 mpg","insurance":"e.g. Group 12","boot":"e.g. 380 litres","reliability":"e.g. Excellent","pros":["item1","item2"],"cons":["item1"]}]}',"Include all cars in the same order as the input list. Use realistic UK figures. Keep pros/cons to 2-3 items each."].filter(Boolean).join("\n");
const resGroq=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${process.env.GROQ_API_KEY}`},body:JSON.stringify({model,temperature:0.3,messages:[{role:"system",content:systemPrompt},{role:"user",content:userPrompt}],response_format:{type:"json_object"}})});
const data=await resGroq.json();
if(!resGroq.ok)return res.status(resGroq.status).json({error:"Groq request failed",status:resGroq.status,details:data});
const raw=data?.choices?.[0]?.message?.content;
if(!raw)return res.status(500).json({error:"No reply from model",details:data});
let parsed;
try{parsed=JSON.parse(raw);}catch(e){return res.status(500).json({error:"Invalid JSON from model",raw:raw.slice(0,500)});}
const carList=Array.isArray(parsed.cars)?parsed.cars:[];
if(carList.length===0)return res.status(500).json({error:"No cars in comparison response",parsed});
return res.status(200).json({cars:carList});
}catch(err){
return res.status(500).json({error:"Server error",details:err?.message||String(err)});
}
}

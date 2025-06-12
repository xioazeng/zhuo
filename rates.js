const url = "https://api.exchangerate-api.com/v4/latest/CNY"; 
const params = getParams($argument); 
$httpClient.get(url, function(error, response, data) { 
  if (error) { 
    $done(); 
    return; 
  } 
  const rates = JSON.parse(data).rates; 
 
  const usdToCny = (1 / rates.USD).toFixed(2); 
  const cnyToHkd = rates.HKD.toFixed(2); 
  const cnyToTwd = rates.TWD.toFixed(2); 
  const cnyToJpy = rates.JPY.toFixed(2); 
  const cnyToNgn = rates.NGN.toFixed(2); 
  const cnyToEgp = rates.EGP.toFixed(2); 
  const eurToCny = (1 / rates.EUR).toFixed(2); 
  const gbpToCny = (1 / rates.GBP).toFixed(2); 
  const tryToCny = rates.TRY.toFixed(2); 
  const cnyToPhp = rates.PHP.toFixed(2); 
  const cnyToInr = rates.INR.toFixed(2); 
  const timestamp = new Date().toLocaleTimeString("en-US", { 
    hour: "2-digit", 
    minute: "2-digit", 
    hour12: false 
  }); 
 
  const content = ` 
🇺🇸 1$ 兑换 🇨🇳${usdToCny}¥ 
🇪🇺 1€ 兑换 🇨🇳${eurToCny}¥ 
🇬🇧 1￡ 兑换 🇨🇳${gbpToCny}¥ 
🇨🇳 1¥ 兑换 🇭🇰${cnyToHkd}HK$ 
🇨🇳 1¥ 兑换 🇹🇼${cnyToTwd}NT$ 
🇨🇳 1¥ 兑换 🇯🇵${cnyToJpy}¥ 
🇨🇳 1¥ 兑换 🇳🇬${cnyToNgn}₦ 
🇨🇳 1¥ 兑换 🇪🇬${cnyToEgp}￡ 
🇨🇳 1¥ 兑换 🇹🇷${tryToCny}₤ 
🇨🇳 1¥ 兑换 🇵🇭${cnyToPhp}₱ 
🇨🇳 1¥ 兑换 🇮🇳${cnyToInr}₹ 
  `; 
 
  const panel = { 
    title: 🪙当前汇率信息 ${timestamp}, 
    content: content, 
         icon: params.icon, 
        "icon-color": params.color 
  }; 
 
  $done(panel); 
}); 
function getParams(param) { 
  return Object.fromEntries( 
    $argument 
      .split("&") 
      .map((item) => item.split("=")) 
      .map(([k, v]) => [k, decodeURIComponent(v)]) 
  ); 
}

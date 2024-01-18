const url = "https://api.exchangerate-api.com/v4/latest/CNY";
const params = getParams($argument);
$httpClient.get(url, function(error, response, data) {
  if (error) {
    $done();
    return;
  }
  const rates = JSON.parse(data).rates;
  const usdToCny = (1 / rates.USD).toFixed(2);
  const eurToCny = (1 / rates.EUR).toFixed(2);
  const gbpToCny = (1 / rates.GBP).toFixed(2);
  const tryToCny = rates.TRY.toFixed(2);
  const cnyToHkd = rates.HKD.toFixed(2);
  const cnyToEgp = rates.EGP.toFixed(2);
  const cnyToNgn = rates.NGN.toFixed(2);
  const cnyToPhp = rates.PHP.toFixed(2);
  const cnyToJpy = rates.JPY.toFixed(2);
  const cnyToNtd = rates.NTD.toFixed(2);
  const cnyToKrw = rates.KRW.toFixed(2);
  const timestamp = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const content = `
🇺🇸1USD$    ${usdToCny}CNY
🇪🇺1EUR€    ${eurToCny}CNY
🇬🇧1BGP£    ${gbpToCny}CNY
🇹🇷1CNY     ${tryToCny}里拉₺
🇭🇰1CNY     ${cnyToHkd}港币HK$
🇪🇬1CNY     ${cnyToEgp}埃及镑£
🇳🇬1CNY     ${cnyToNgn}奈拉₦
🇵🇭1CNY     ${cnyToPhp}比索₱
🇯🇵1CNY     ${cnyToJpy}日元￥
🇨🇳1CNY     ${cnyToJpy}新台币NT$
🇰🇷1CNY     ${cnyToKrw}韩元₩
  `;

  const panel = {
    title: `🪙当前汇率信息 ${timestamp}`,
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

//会员

var body = $response.body;
var obj = JSON.parse (body);

obj.status = "ACTIVE"
obj.canGetTrial = false;
obj.startDate = 2023-09-20T04:02:55.187+0000;
obj.subscription."type" = "PREMIUM_PLUS";
obj.subscription."offlineGracePeriod" = 999999;
obj.paymentType = "AmEx_CREDIT_CARD";
obj.paymentOverdue = false;
obj.highestSoundQuality = "HI_RES";
obj.validUntil = "2099-09-20T04:02:55.187+0000";

body = JOSN stringify(obj);
$done({body});

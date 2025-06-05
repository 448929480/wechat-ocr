const axios = require('axios');
const xml2js = require('xml2js');

// OCR.space API 密钥
const OCR_API_KEY = 'K83205907388957';

// 微信公众平台的 Token（你在微信后台配置的 Token）
const WECHAT_TOKEN = 'your_wechat_token';

// 验证微信服务器请求签名的函数
function checkSignature(signature, timestamp, nonce) {
  const token = WECHAT_TOKEN;
  const array = [token, timestamp, nonce];
  array.sort();
  const temp = array.join('');
  const sha1 = require('crypto').createHash('sha1').update(temp).digest('hex');
  return sha1 === signature;
}

// 处理微信的 GET 请求，验证服务器
module.exports = async (req, res) => {
  const { query } = req;

  const { signature, timestamp, nonce, echostr } = query;
  if (checkSignature(signature, timestamp, nonce)) {
    // 返回 echostr，完成验证
    return res.send(echostr);
  } else {
    return res.status(403).send('Failed to validate');
  }
};

// 处理微信的 POST 请求，接收用户消息并进行 OCR 识别
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      // 解析 XML 格式的消息
      const parser = new xml2js.Parser();
      parser.parseString(body, async (err, result) => {
        if (err) {
          return res.status(500).send('Error parsing XML');
        }

        // 获取消息中的媒体 ID（用于获取图片）
        const mediaId = result.xml.MediaId[0];
        const fromUser = result.xml.FromUserName[0];
        const toUser = result.xml.ToUserName[0];

        // 获取微信 access_token（此示例假设你已经获得 access_token）
        const accessToken = 'your_access_token';
        const imageUrl = await getImageUrl(accessToken, mediaId);

        // 调用 OCR.space API 进行图片识别
        const ocrResult = await ocrSpace(imageUrl);

        // 回复用户识别的文本
        const reply = buildTextResponse(fromUser, toUser, ocrResult);
        return res.send(reply);
      });
    });
  } else {
    return res.status(405).send('Method Not Allowed');
  }
};

// 获取图片 URL
async function getImageUrl(accessToken, mediaId) {
  const url = `https://api.weixin.qq.com/cgi-bin/media/get?access_token=${accessToken}&media_id=${mediaId}`;
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const imageBuffer = Buffer.from(response.data, 'binary');
  
  // 你可以将图片保存到服务器，或者直接使用图像的 Base64 编码，或者直接上传至 OCR API
  return `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
}

// 调用 OCR.space API 进行图片识别
async function ocrSpace(imageUrl) {
  const url = 'https://api.ocr.space/parse/image';
  const response = await axios.post(url, {
    apikey: OCR_API_KEY,
    url: imageUrl
  });

  const result = response.data;
  if (result.ParsedResults && result.ParsedResults.length > 0) {
    return result.ParsedResults[0].ParsedText;
  }
  return 'OCR识别失败';
}

// 构建微信的文本回复
function buildTextResponse(fromUser, toUser, content) {
  const createTime = Math.floor(Date.now() / 1000);
  return `
    <xml>
      <ToUserName><![CDATA[${fromUser}]]></ToUserName>
      <FromUserName><![CDATA[${toUser}]]></FromUserName>
      <CreateTime>${createTime}</CreateTime>
      <MsgType><![CDATA[text]]></MsgType>
      <Content><![CDATA[${content}]]></Content>
    </xml>
  `;
}

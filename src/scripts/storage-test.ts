import "dotenv/config";
import { Files } from "files-sdk";
import { s3 } from "files-sdk/s3";

const files = new Files({
  adapter: s3({ bucket: process.env.STORAGE_BUCKET ?? "uploads", forcePathStyle: true }),
});
const key = `test/${Date.now()}.txt`;
const content = `对象存储自检
时间: ${new Date().toISOString()}
说明: Files SDK 上传后列举并回读
`;

const uploaded = await files.upload(key, content, { contentType: "text/plain; charset=utf-8" });
console.log(`上传成功: ${uploaded.key} (${uploaded.size} bytes)`);

const listed = await files.list({ prefix: "test/" });
console.log(`列举成功: ${listed.items.length} 个对象`);
for (const item of listed.items) {
  console.log(`  - ${item.key} (${item.size} bytes)`);
}

const file = await files.download(key);
const text = new TextDecoder().decode(new Uint8Array(await file.arrayBuffer()));
console.log("读回内容:");
console.log(text);

# vite-plugin-ossplus
[![npm](https://img.shields.io/npm/v/vite-plugin-ossplus.svg)](https://www.npmjs.com/package/vite-plugin-ossplus)
[![LICENSE MIT](https://img.shields.io/npm/l/vite-plugin-ossplus.svg)](https://www.npmjs.com/package/vite-plugin-ossplus) 

> vite 第三方平台OSS上传插件, 可在 vite 打包结束后将 生成的文件自动上传到 OSS 中，目前支持阿里云、腾讯云、七牛云服务提供商

## 安装使用
使用npm或者yarn快速安装
```bash
npm install vite-plugin-ossplus -D
# or yarn
yarn add vite-plugin-ossplus -D
```

根据使用场景使用，下面简单举例：

```javascript
// vite.config.js
import vitePluginOSSPlus from 'vite-plugin-ossplus';

const CDN_HOST = '//example.com'; // CDN 域名
const CDN_PATH = 'testProject'; // CDN 路径
const ENV = 'dev'; // 当前的环境等等
const version = 'v1.0.0'; // 当前发布的版本(也可以取Git hash版本)
const CDN_RESOURCE_PATH = `${ENV}/${version}/`;

// 根据上面信息，拼接处CDN资源域名+路径
const getPublicPath = () => {
  return `${CDN_HOST}/${CDN_PATH}/${ENV}/${version}/`; // 依据 ENV 等动态构造 publicPath
};

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? getPublicPath() : '/', // 资源替换的CDN域名及路径前缀
  plugins: [
    ...,
    vitePluginOSSPlus({
      provider: {
        aliOSS: {
          accessKeyId: 'xxx', // 在阿里 OSS 控制台获取
          accessKeySecret: 'xxx', // 在阿里 OSS 控制台获取
          region: 'xxx', // OSS 服务节点, 示例: oss-cn-hangzhou
          bucket: 'xxx', // OSS 存储空间, 在阿里 OSS 控制台获取
        },
        // 如果是，腾讯云OSS 配置
        // qcloudOS: {
        //   SecretId: 'xxx',
        //   SecretKey: 'xxx',
        //   Region: 'ap-guangzhou',
        //   Bucket: 'xx',
        // }
      },
      ossBaseDir: CDN_PATH, // 一级目录
      project: CDN_RESOURCE_PATH, // 二级目录，项目名(用于存放文件的直接目录)
      enableLog: false,
      // include: /(static).*?/  // 可以筛选符合条件的静态资源文件，示例为：配置资源路径包含static，不填默认全部非.html文件
    }),
  ],
});
```

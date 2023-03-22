import path, { resolve } from 'path';
import chalk from 'chalk';
import { mergeWith, cloneDeep, isPlainObject, merge, map } from 'lodash';
import AliOSS from 'ali-oss';
import COS from 'cos-nodejs-sdk-v5';
import { Buffer } from 'buffer';
import zlib from 'zlib';
import { Plugin, normalizePath } from 'vite';
import glob from 'glob';
import { readFileSync } from 'fs';

export interface QcouldOSSOptions {
  /**
   * OSS 访问 key
   */
  SecretId?: string;
  /**
   * OSS 访问 secret
   */
  SecretKey?: string;
  /**
   * OSS 存储空间
   */
  Bucket?: string;
  /**
   * OSS 服务节点, eg: ap-guangzhou
   *
   */
  Region?: string;
  options?: {
    headers?: any;
  };
}
export interface AliOSSOptions {
  /**
   * OSS 访问 key
   */
  accessKeyId?: string;
  /**
   * OSS 访问 secret
   */
  accessKeySecret?: string;
  /**
   * OSS 存储空间
   */
  bucket?: string;
  /**
   * OSS 服务节点, eg: oss-cn-hangzhou
   *
   */
  region?: string;
  /**
   * 可用于设置文件的请求头、超时时间等
   *
   * 参考: https://github.com/ali-sdk/ali-oss#putname-file-options
   *
   * 默认值: undefined
   */
  options?: {
    headers?: any;
  };
}

export interface ViteOSSPlusPluginOptions {
  // 提供商信息
  provider: {
    /**
     * 阿里 oss 认证相关信息, 全部支持环境变量
     */
    aliOSS?: AliOSSOptions;
    qcloudOS?: QcouldOSSOptions;
    // TODO： 支持七牛云OSS
  };
  /**
   * 要排除的文件, 符合该正则表达式的文件不会上传
   *
   * 默认值: /.*\.html$/
   */
  exclude?: RegExp;

  /**
   * 要b包含的文件, 符合该正则表达式的文件要上传
   *
   * 默认值: /.*\.html$/
   */
  include?: RegExp;
  /**
   * 是否开启调试日志
   *
   * 默认不开启 (false)
   *
   */
  enableLog?: boolean;
  /**
   * 上传过程中出现错误是否忽略该错误继续 vite 构建
   *
   * 默认不忽略 (false)
   *
   */
  ignoreError?: boolean;
  /**
   * OSS 中存放上传文件的目录名 (文件最终会上传至 `${ossBaseDir}/${project}` 目录下)
   *
   * 默认值: 'auto_upload_ci'
   *
   */
  ossBaseDir: string;
  /**
   * 项目名 (文件最终会上传至 `${ossBaseDir}/${project}` 目录下)
   *
   * 默认值: package.json 中的 name 值
   */
  project: string;
  /**
   * 上传失败时的重试次数
   *
   * 默认值: 3
   */
  retry?: number;
  /**
   * 上传前是否检测该文件名是否已经存在
   *
   * true: 先检测同名文件是否已存在, 已存在则不上传, 否则上传
   * false: 直接上传访文件, 如已存在则覆盖
   *
   * 默认值: true 代表会检测
   */
  existCheck?: boolean;
  /**
   * 是否先进行 gzip 压缩后再上传
   *
   * 默认值: true
   */
  gzip?: boolean;
}

function getTimeStr(d) {
  return `${d.getFullYear()}-${
    d.getMonth() + 1
  }-${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;
}

function getFileContentBuffer(file, gzipFlag) {
  if (!gzipFlag) return Promise.resolve(Buffer.from(file.content));
  return new Promise((resolve, reject) => {
    zlib.gzip(Buffer.from(file.content), {}, (err, gzipBuffer) => {
      if (err) reject(err);
      resolve(gzipBuffer);
    });
  });
}

function log(...args) {
  console.log(chalk.bgMagenta('[vite-plugin-ossplus]:'), ...args) // eslint-disable-line
}

function warn(...args) {
  console.warn(chalk.bgMagenta('[vite-plugin-ossplus]:'), ...args) // eslint-disable-line
}

const defaultConfig: ViteOSSPlusPluginOptions = {
  provider: {},
  retry: 3, // 重试次数: number(>=0)
  existCheck: true, // true: 直接上传、false: 先检测,若已存在则不重新上传(不报错)
  // prefix 或者 ossBaseDir + project 二选一
  ossBaseDir: 'auto_upload_ci',
  project: '',
  exclude: /.*\.html$/,
  include: /.*/,
  enableLog: false,
  ignoreError: false,
  gzip: true,
};

const { red } = chalk;
const { green } = chalk.bold;
const { yellow } = chalk;

enum ProviderType {
  AliOSS = 0, // 阿里云OSS
  QCloudOSS = 1, // 腾讯云OSS
}

interface IFileInfo {
  name: string;
  path: string;
  content: string | Buffer;
  $retryTime?: number;
}

export class ViteOSSPlusPluginCore {
  config = defaultConfig; // 配置参数

  client = {} as AliOSS & COS; // 阿里云OSS客户端

  finalPrefix = ''; // 最终计算出来的prefix路径

  currentProvider = {} as AliOSSOptions & QcouldOSSOptions; // 当前提供服务商信息

  providerType;

  constructor(config: ViteOSSPlusPluginOptions) {
    // 合并配置信息
    this.config = mergeWith(
      cloneDeep(this.config),
      config || {},
      (objVal, srcVal) => {
        if (isPlainObject(objVal) && isPlainObject(srcVal)) {
          return merge(objVal, srcVal);
        }
        return srcVal;
      }
    );

    const { retry, provider, ossBaseDir, project } = this.config;
    // 容错处理
    if (typeof retry !== 'number' || retry < 0) {
      this.config.retry = 0;
    }

    // 上传OSS的最终路径
    this.finalPrefix = `${ossBaseDir}/${project}`;

    this.debug('默认配置:', defaultConfig);
    this.debug('项目配置:', config);
    this.debug('最终使用的配置:', this.config);

    if (typeof provider.aliOSS !== 'undefined') {
      this.currentProvider = provider.aliOSS;
      this.providerType = ProviderType.AliOSS;
      const { accessKeyId, accessKeySecret, bucket, region } = provider.aliOSS;
      this.client = AliOSS({
        accessKeyId,
        accessKeySecret,
        bucket,
        region,
      });
    } else if (typeof provider.qcloudOS !== 'undefined') {
      this.currentProvider = provider.qcloudOS;
      this.providerType = ProviderType.QCloudOSS;
      const { SecretId, SecretKey } = provider.qcloudOS;
      this.client = new COS({
        SecretId,
        SecretKey,
      });
    }
  }

  pickupAssetsFile(sourceFiles: string[], outDirPath: string): IFileInfo[] {
    const matched: IFileInfo[] = [];
    for (let i = 0; i < sourceFiles.length; i++) {
      const resolveFilePath = sourceFiles[i];
      const fileName = resolveFilePath.split(outDirPath)[1];
      // 排除不符合要求的文件
      if (this.config.exclude?.test(fileName)) {
        continue;
      }

      // 查找符合条件的文件
      if (this.config.include?.test(fileName)) {
        matched.push({
          name: fileName,
          path: resolveFilePath,
          content: readFileSync(resolveFilePath, { encoding: null }),
        });
      }
    }

    return matched;
  }

  hanleFilesUpload(sourceFiles: string[], outDirPath: string) {
    const files = this.pickupAssetsFile(sourceFiles, outDirPath);
    if (files.length === 0) {
      warn(`${yellow('\n 没有找到符合条件的文件上传，请检测配置信息！')}`);
      return;
    }
    log(`${green('\nOSS 上传开始......')}`);
    this.batchUploadFiles(files)
      .then(() => {
        log(`${green('OSS 上传完成\n')}`);
      })
      .catch((err) => {
        log(
          `${red('OSS 上传出错')}::: ${red(err.code)}-${red(err.name)}: ${red(
            err.message
          )}`
        );
        if (!this.config.ignoreError) {
          throw Error('OSS 上传出错');
        }
      });
  }

  batchUploadFiles(files) {
    let i = 1;
    return Promise.all(
      map(files, (file) => {
        file.$retryTime = 0;
        let uploadName;
        if (path.sep === '/') {
          uploadName = path.join(this.finalPrefix, file.name);
        } else {
          // Windows 路径进行处理
          uploadName = path
            .join(this.finalPrefix, file.name)
            .split(path.sep)
            .join('/');
        }
        // 是否检测文件存在，不检测直接上传处理
        if (!this.config.existCheck) {
          return this.uploadFile(file, i++, files, uploadName);
        }
        return this.checkOSSFile(file, i++, files, uploadName);
      })
    );
  }

  uploadFile(
    file: IFileInfo,
    idx: number,
    files: IFileInfo[],
    uploadName: string
  ) {
    // 上传文件处理
    if (this.providerType === ProviderType.AliOSS) {
      return this.aliUploadFile(file, idx, files, uploadName);
    }

    if (this.providerType === ProviderType.QCloudOSS) {
      return this.qcloudUploadFile(file, idx, files, uploadName);
    }

    return Promise.reject('没有找到上传SDK!');
  }

  aliUploadFile(
    file: IFileInfo,
    idx: number,
    files: IFileInfo[],
    uploadName: string
  ) {
    return new Promise((resolve, reject) => {
      const fileCount = files.length;
      // 获取文件内容进行压缩处理
      getFileContentBuffer(file, this.config.gzip)
        .then((contentBuffer) => {
          const opt = this.getOSSUploadOptions();
          const _this = this;
          function _uploadAction() {
            file.$retryTime++;
            log(
              `开始上传 ${idx}/${fileCount}: ${
                file.$retryTime > 1 ? `第${file.$retryTime - 1}次重试` : ''
              }`,
              uploadName
            );
            _this.client
              .put(uploadName, contentBuffer, opt)
              .then((response) => {
                log(`上传成功 ${idx}/${fileCount}: ${uploadName}`);
                resolve(response);
              })
              .catch((err) => {
                if (file.$retryTime < _this.config.retry + 1) {
                  _uploadAction();
                } else {
                  reject(err);
                }
              });
          }
          _uploadAction();
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  qcloudUploadFile(
    file: IFileInfo,
    idx: number,
    files: IFileInfo[],
    uploadName: string
  ) {
    return new Promise((resolve, reject) => {
      const fileCount = files.length;
      getFileContentBuffer(file, this.config.gzip)
        .then((contentBuffer) => {
          const _this = this;
          function _uploadAction() {
            file.$retryTime++;
            log(
              `开始上传 ${idx}/${fileCount}: ${
                file.$retryTime > 1 ? `第${file.$retryTime - 1}次重试` : ''
              }`,
              uploadName
            );
            _this.client.putObject(
              {
                Bucket:
                  _this.currentProvider
                    .Bucket /* 填入您自己的存储桶，必须字段 */,
                Region:
                  _this.currentProvider
                    .Region /* 存储桶所在地域，例如ap-beijing，必须字段 */,
                Key: uploadName /* 存储在桶里的对象键（例如1.jpg，a/b/test.txt），必须字段 */,
                Body: contentBuffer /* 必须 */,
              },
              function (err, data) {
                if (err) {
                  if (file.$retryTime < _this.config.retry + 1) {
                    _uploadAction();
                  } else {
                    reject(err);
                  }
                } else {
                  log(`上传成功 ${idx}/${fileCount}: ${uploadName}`);
                  resolve(data);
                }
              }
            );
          }
          _uploadAction();
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  checkOSSFile(
    file: IFileInfo,
    idx: number,
    files: IFileInfo[],
    uploadName: string
  ) {
    // 检测OSS是否存在该文件处理
    if (this.providerType === ProviderType.AliOSS) {
      return this.aliCheckOSSFile(file, idx, files, uploadName);
    }

    if (this.providerType === ProviderType.QCloudOSS) {
      return this.qcloudCheckOSSFile(file, idx, files, uploadName);
    }

    return Promise.reject('检测OSS文件失败！');
  }

  aliCheckOSSFile(
    file: IFileInfo,
    idx: number,
    files: IFileInfo[],
    uploadName: string
  ) {
    return new Promise((resolve, reject) => {
      this.client
        .list({
          'prefix': uploadName,
          'max-keys': 50,
        })
        .then((res) => {
          const arr = (res.objects || []).filter(
            (item) => item.name === uploadName
          );
          if (arr && arr.length > 0) {
            const timeStr = getTimeStr(new Date(res.objects[0].lastModified));
            log(
              `${green('已存在,免上传')} (上传于 ${timeStr}) ${idx}/${
                files.length
              }: ${uploadName}`
            );
            resolve(res);
          } else {
            throw new Error('not exist & need upload');
          }
        })
        .catch((err) => {
          // 如果获取失败，则处理文件上传
          this.uploadFile(file, idx, files, uploadName)
            .then((uRes) => {
              resolve(uRes);
            })
            .catch((uErr) => {
              reject(uErr);
            });
        });
    });
  }

  qcloudCheckOSSFile(
    file: IFileInfo,
    idx: number,
    files: IFileInfo[],
    uploadName: string
  ) {
    return new Promise((resolve, reject) => {
      this.client.headObject(
        {
          Bucket: this.currentProvider.Bucket,
          Region: this.currentProvider.Region,
          key: uploadName,
        },
        (err, result) => {
          if (result) {
            log(
              `${green('已存在,免上传')} ${idx}/${files.length}: ${uploadName}`
            );
            resolve(result);
          } else {
            if (err.statusCode == 404) {
              console.log('对象不存在');
            } else if (err.statusCode == 403) {
              console.log('没有该对象读权限');
            }
            // 如果获取失败，则处理文件上传
            this.qcloudUploadFile(file, idx, files, uploadName)
              .then((uRes) => {
                resolve(uRes);
              })
              .catch((uErr) => {
                reject(uErr);
              });
          }
        }
      );
    });
  }

  getOSSUploadOptions() {
    const currentOptions = this.currentProvider.options;
    const { gzip } = this.config;
    if (gzip) {
      if (currentOptions) {
        currentOptions.headers['Content-Encoding'] = 'gzip';
        return currentOptions;
      }
      return {
        headers: { 'Content-Encoding': 'gzip' },
      };
    }
    return currentOptions || undefined;
  }

  debug(...args) {
    this.config.enableLog && log(...args);
  }
}

export default function ViteOSSPlusPlugin(
  options: ViteOSSPlusPluginOptions
): Plugin {
  let buildConfig: any;

  const client = new ViteOSSPlusPluginCore(options);

  return {
    name: 'vite-plugin-ossplus',
    enforce: 'post',
    apply: 'build',
    configResolved(config) {
      buildConfig = config.build;
    },
    async closeBundle() {
      const outDirPath = normalizePath(
        resolve(normalizePath(buildConfig.outDir))
      );
      // 获取所有文件信息
      const files = await glob.sync(`${outDirPath}/**/*`, {
        nodir: true,
        dot: true,
      });
      client.hanleFilesUpload(files, outDirPath);
    },
  };
}

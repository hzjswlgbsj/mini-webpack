import fs from "fs";
import parser from "@babel/parser";
import traverse from "@babel/traverse";
import path from "path";
import ejs from "ejs";
import { transformFromAst } from "babel-core";
let id = 0;
/**
 * * 创建资源
 * 1.获取文件内容
 * 2.获取以来关系
 * @param {string} filePath 入口文件路径
 * @returns {source,deps}
 */
function createAsset(filePath) {
  // 1.获取文件内容
  const source = fs.readFileSync(filePath, { encoding: "utf-8" });
  console.log("文件内容", source);

  // 2.获取以来关系
  const ast = parser.parse(source, {
    // parse in strict mode and allow module declarations
    sourceType: "module",

    // plugins: [
    //   // enable jsx and flow syntax
    //   "jsx",
    //   "flow",
    // ],
  });

  console.log("生成的ast", ast);

  const deps = []; // 保存依赖关系
  // 遍历整个 ast ，拿到代码中的文件路径
  // babel 提供了这样的遍历工具 @babel/traverse
  // 这里的 ImportDeclaration 其实就是一个回调函数，函数名就是ast节点的type，在遍历ast节点的时候会别调用
  traverse.default(ast, {
    // 处理 import 类型的节点
    ImportDeclaration({ node }) {
      deps.push(node.source.value);
    },
  });

  const { code } = transformFromAst(ast, null, { presets: ["env"] });
  console.log("babel-core转化后的code", code);

  return {
    filePath,
    code,
    deps,
    mapping: {},
    id: id++,
  };
}

function createGraph() {
  // 得到入口文件的源代码和依赖关系
  const mainAsset = createAsset("./example/main.js");
  console.log("得到入口文件源代码和依赖关系", mainAsset);

  // 接下来基于依赖关系找到下一个依赖关系，依次进行
  // 遍历图，使用广度优先搜索
  const queue = [mainAsset]; // 保存节点

  for (const asset of queue) {
    asset.deps.forEach((relativePath) => {
      // 使用 path 模块处理路径
      const child = createAsset(path.resolve("./example", relativePath));
      asset.mapping[relativePath] = child.id;
      queue.push(child);
    });
  }

  return queue;
}

const graph = createGraph();

function build(graph) {
  const template = fs.readFileSync("./bundle.ejs", { encoding: "utf-8" });

  // 生成模板需要的数据
  const data = graph.map((asset) => {
    const { id, code, mapping } = asset;
    return {
      id,
      code,
      mapping,
    };
  });

  const code = ejs.render(template, { data });
  console.log("生成的代码", code);

  // 生成文件
  fs.writeFileSync("./dist/bundle.js", code);
}

build(graph);

这是一个 mini 版的 webpack ，主要用于学习 webpack 的基本原理。

首先先新建 `foo.js` 、 `bar.js` 、 `index.html`、`main.js`、`index.js`。其中 `foo.js` 、 `bar.js` 、 `index.html` 用于测试，`foo.js` 引用 `bar.js` 并执行其中的函数，`main.js` 作为打包入口文件，`index.js` 是打包器源码。

## 目标

执行 `index.js` 后能将 `foo.js` 、 `bar.js` 打包到一个 `bundle.js` 中，处理好文件之间的引用关系，然后在 `index.html` 引用 `bundle.js` 能顺利执行到里面的逻辑。

## 实现

要实现这个过程需要基于这些文件的内容生产一个图（graph），这个图记录了文件的内容数据，再根据这个图生成脚本代码，拆分成主要的两个任务：

1. 将文件内容生成图结构
2. 根据图结构生成代码

### 生成图结构

图结构有两个重要的要素：

- 当前文件内部的代码内容
- 当前文件中的依赖关系

有这两个信息才能构成一个图结构

#### 获取文件中的代码内容

使用 fs 模块来获取文件的内容

```javascript
// 1.获取文件内容
const source = fs.readFileSync("./example/main.js", {
  encoding: "utf-8",
});
console.log("文件内容", source);
```

#### 获取文件依赖关系

这肯定离不开分析文件内容中的代码了，比如在 esm 规范中的 `import` 就表示引入了其他依赖，我们可以使用正则表达式来做这个功能，但是使用正则来分析代码这个动作听起来就很像是做文本代码编译生成 token ，生成抽象语法树，那肯定有库啊。没错，你跟我一样肯定想到了 babel，他不就是专门做这种事的吗。

先看一下 ast 的在线解析，了解抽象语法树到底是什么样的，[传送](https://astexplorer.net/)

![ast示例](https://lib.sixtyden.com/ast_example.jpg)

接下来引入 `@babel/parser` 来生成 ast，引入 `@babel/traverse` 来帮助遍历 ast 将 `import` 类型的节点收集成依赖。

```javascript
function createAsset() {
  // 1.获取文件内容
  const source = fs.readFileSync("./example/main.js", {
    encoding: "utf-8",
  });
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

  return {
    source,
    deps,
  };
}
```

到此我们已经有了源代码 source 和依赖关系 deps 了，可以开始生成这个图结构了。

```javascript
function createGraph() {
  // 得到入口文件的源代码和依赖关系
  const mainAsset = createAsset("./example/main.js");
  console.log("得到入口文件源代码和依赖关系", mainAsset);

  // 接下来基于依赖关系找到下一个依赖关系，依次进行
  // 遍历图，使用广度优先搜索
  const queue = [mainAsset]; // 保存节点

  for (const asset of queue) {
    asset.deps.forEach((relativePath) => {
      // 使用 path 模块处理路径，这里的 example 文件夹路径先写死，后面再改成动态的
      const child = createAsset(path.resolve("./example", relativePath));
      console.log("child", child);
      queue.push(child);
    });
  }

  return queue;
}
```

### 生成代码

现在图结构也已经有了，接下来就是根据图结构生成 js 代码了，一般情况是生成一个 `bundle.js`，这里可以先手动创建一个 `bundle.js` 文件，先看一下我们需要生成的文件内容到底是啥样。

#### 手写生成后的代码

这个打包后的文件应该是包含很多个文件的代码内容的，我们可以先手动写一个示例，直接简单的把文件的代码堆叠的放进来：
**bundle.js**

```javascript
// main.js
import { foo } from "./foo.js";

foo();

console.log("main.js");

// foo.js
import { bar } from "./bar.js";

export function foo() {
  bar();
  console.log("foo");
}
```

观察上面的代码，很明显这样是不行的，一眼就看到一个问题，命名冲突，两个文件中很有可能有一样的变量名函数名等等。怎么解决呢？JavaScript 中不是有个函数作用域吗？用函数包裹就行了。

```javascript
function mainjs() {
  // main.js
  import { foo } from "./foo.js";

  foo();

  console.log("main.js");
}

function foo() {
  // foo.js
  import { bar } from "./bar.js";

  export function foo() {
    bar();
    console.log("foo");
  }
}
```

新的问题来了，这代码里面的 `import` 关键字肯定是不认识的，会报错。这时候很容易就想起来了 Nodejs 的 `commonjs` 模块规范。

```javascript
function mainjs() {
  // main.js
  const foo = require("./foo.js");

  foo();

  console.log("main.js");
}

function foo() {
  // foo.js
  const foo = require("./foo.js");
  function foo() {
    bar();
    console.log("foo");
  }
  module.exports = {
    foo,
  };
}
```

现在语法问题解决了，我们需要去实现类似于 Nodejs 的 require 方法，可以直接看代码里的注释，代码被包裹在一个 IIFE 中，然后路径和函数的映射关系传进去，生成的模块的包裹函数也放到外面传进来，这样 IIFE 里面的代码就是纯净的，相对固定的，我们生成 bundle.js 的代码的时候就只关心变动部分，不变的部分就是写死的模板。

```javascript
((function (modules) {
  /**
   * 通过 filePath 找到对应的模块，在这里就是找到包裹代码的函数
   * require 的作用就是帮你去调用导出模块的export函数
   * @param {string} filePath
   * @returns module.exports
   */
  function require(filePath) {
    // 简单理解就是 filePath 映射了一个函数名
    // 拿到模块函数，并执行
    const fn = modules[filePath];

    // 构建 module
    const module = {
      exports: { fn },
    };

    fn(require, module, module.exports);

    // require 函数应该返回的就是
    // module.exports = {
    //   foo,
    // };
    return module.exports;
  }

  require("./main.js"); // 先加载入口文件
})({
  "./foo.js": function (require, module, exports) {
    // foo.js
    // const bar = require("./bar.js");
    function foo() {
      // bar();
      console.log("foo");
    }
    module.exports = {
      foo,
    };
  },
  "./main.js": function (require, module, exports) {
    // main.js
    const { foo } = require("./foo.js");
    foo();
    console.log("main.js");
  },
});
```

在 `index.html` 中引入 `bundle.js` 就能看到控制台的打印了，说明生成的 bundle 文件就应该是我们手动书写的代码这样。接下来要做的就是使用我们实现的工具来自动生成这个 `bundle.js` 中的代码。

#### 自动生成代码

如何生成这个文件的内容呢？

- 可以用字符串拼接
- 可以利用模板生成器

这里当然是使用模板生成器了，我们直接使用 [ejs](https://ejs.co/#install) 来生成代码。

先创建一个 `bundle.ejs` 文件作为模板，内容就是我们刚才手动自己写的 `bundle.js` 中的内容，然后使用 ejs 来生成内容，再用 fs 模块来生成文件。

```javascript
function build(graph) {
  const template = fs.readFileSync("./bundle.ejs", { encoding: "utf-8" });
  const code = ejs.render(template);
  console.log("生成的代码", code);

  // 生成文件
  fs.writeFileSync("./dist/bundle.js", code);
}
```

到这一步就生成好了打包文件了，目前模板是写死的，接下来我们把模板中的动态部分使用变量来替换。分析之后可以知道，bundle.ejs 中动态的不分也就是 IIFE 的入参不分，他是一个对象，是一个文件路径和文件源码的映射关系

```javascript
{
  "./foo.js": function (require, module, exports) {
    // foo.js
    // const bar = require("./bar.js");
    function foo() {
      // bar();
      console.log("foo");
    }
    module.exports = {
      foo,
    };
  },
  "./main.js": function (require, module, exports) {
    // main.js
    const { foo } = require("./foo.js");
    foo();
    console.log("main.js");
  },
}
```

这个 map 结构中的 key 是一个文件路径，这个在得到的抽象语法树中是有的，后来被保存在了图结构中，value 部分就是一个 function 包裹了源码，也在图结构中保存了。

要生成这样的代码还有一个问题，代码中需要生成的是 commonjs 模块规范，我们的源代码中比如 foo.js 中使用的是 esm 模块规范，这个就需要处理，恰好 babel-core[https://www.npmjs.com/package/babel-core] 就是专门干这个事情的，之前我们在遍历 ast 的时候只是处理了 ImportDeclaration 类型的节点，拿到了依赖关系，现在我们可以对模块规范也做相应的处理。

```javascript
// 记住要提前安装一个依赖
// pnpm i babel-preset-env
const { code } = babel.transformFromAst(ast, null, { presets: ["env"] });
console.log("babel-core转化后的code", code);

// 转化后的输出如下
// "use strict";

// Object.defineProperty(exports, "__esModule", {
//   value: true
// });
// exports.bar = bar;

// function bar() {
//   console.log("bar");
// }
```

这样的话代码就从 esm 变成了 commonjs 规范了，接下俩就是讲模板中写死的部分改成变量。首先要做数据准备，这个数据要传入到 ejs 模板中去的，修改 build 方法

```javascript
function build(graph) {
  const template = fs.readFileSync("./bundle.ejs", { encoding: "utf-8" });

  // 生成模板需要的数据
  const data = graph.map((asset) => {
    return {
      filePath: asset.filePath,
      code: asset.code,
    };
  });

  const code = ejs.render(template, data);
  console.log("生成的代码", code);

  // 生成文件
  fs.writeFileSync("./dist/bundle.js", code);
}
```

再修改 `bundle.ejs`

```javascript
(function (modules) {
  /**
  * 通过 filePath 找到对应的模块，在这里就是找到包裹代码的函数
  * require 的作用就是帮你去调用导出模块的export函数
  * @param {string} filePath
  * @returns module.exports
  */
  function require(filePath) {
  // 简单理解就是 filePath 映射了一个函数名
  // 拿到模块函数，并执行
  const fn = modules[filePath];

  // 构建 module
  const module = {
  exports: { fn },
  };

  fn(require, module, module.exports);

  // require 函数应该返回的就是
  // module.exports = {
  // foo,
  // };
  return module.exports;
  }

  require("./main.js"); // 先加载入口文件
})({
<% data.forEach(info=> { %>
  "<%- info['filePath'] %>": function (require, module, exports) {
    <%- info['code'] %>
    },
  <%}); %>
});
```

这样就成功的生成出了基本正确的代码了，仔细看有发现了一个问题：**我们是通过 filePath 来找到包裹模块代码的函数，但是生成的代码中可以看到这个 filePath 是不对的，下面的子模块的 filePath 是电脑的绝对路径**

这个还不能简单的改写下面的绝对路径成相对路径，因为整个项目中可能有很多文件夹，可能会有重复的相对路径。

所以我们可能要扩展生成代码中 IIFE 传入的那个参数的数据结构了，我们可以给每个模块都加上一个唯一 id，然后每个模块增加一个对象来存储模块唯一 id 和 filePath 的映射关系，这样的话我们可以解决 filePath 命名冲突问题。

手动修改后的 `bundle.js` 内容如下

```javascript
(function (modules) {
  /**
   * 通过 filePath 找到对应的模块，在这里就是找到包裹代码的函数
   * require 的作用就是帮你去调用导出模块的export函数
   * @param {number} id
   * @returns module.exports
   */
  function require(id) {
    // 简单理解就是 filePath 映射了一个函数名
    // 拿到模块函数，并执行
    const [fn, mapping] = modules[id];

    // 构建 module
    const module = {
      exports: { fn },
    };

    function localRequire(filePath) {
      const id = mapping[filePath];
      return require(id);
    }

    fn(localRequire, module, module.exports);

    // require 函数应该返回的就是
    // module.exports = {
    //   foo,
    // };
    return module.exports;
  }

  require(1); // 先加载入口文件
})({
  1: [
    function (require, module, exports) {
      // main.js
      const { foo } = require("./foo.js");
      foo();
      console.log("main.js");
    },
    {
      "./foo.js": 2,
    },
  ],
  2: [
    function (require, module, exports) {
      // foo.js
      // const bar = require("./bar.js");
      function foo() {
        // bar();
        console.log("foo");
      }
      module.exports = {
        foo,
      };
    },
    {},
  ],
});
```

浏览器访问 `index.html` 可以看到效果是正确的，接下来就需要把这个更新改动更新到 `bundle.ejs` 模板中

```javascript
(function (modules) {
  /**
  * 通过 filePath 找到对应的模块，在这里就是找到包裹代码的函数
  * require 的作用就是帮你去调用导出模块的export函数
  * @param {number} id
  * @returns module.exports
  */
  function require(id) {
    // 简单理解就是 filePath 映射了一个函数名
    // 拿到模块函数，并执行
    const [fn, mapping] = modules[id];

    // 构建 module
    const module = {
      exports: { fn },
    };

    function localRequire(filePath) {
      const id = mapping[filePath];
      return require(id);
    }

    fn(localRequire, module, module.exports);

    // require 函数应该返回的就是
    // module.exports = {
    // foo,
    // };
    return module.exports;
  }

  require(0); // 先加载入口文件
})({
  <% data.forEach(info=> { %>
    "<%- info['id'] %>": [function (require, module, exports) {
      <%- info['code'] %>
    }, <%- JSON.stringify(info['mapping']) %>],
  <%}); %>
});
```

然后再次执行 `node index.js`，结束后查看 dist 文件夹下面的 `bundle.js` 发现代码生成正确。

## 增加 loader 机制

在 `example` 文件夹下面创建 `user.json` ，然后在 `main.js` 中引入，再次执行打包，发现报语法错误了，他还是把 json 文件当做 js 在处理导致无法打包。webpack 为了解决这个问题增加了 loader 机制，接下来我们也要实现一个简单版的 loader 机制，并为 json 文件增加一个 json-loader。

首先阅读一下官方自定义 loader 的[指南](https://webpack.js.org/contribute/writing-a-loader/)，分析后得知主要需要两个点：

- 需要一个配置文件，配置 loader 处理的文件类型
- 接收一个 loader 函数去处理不同类型的文件，并返回翻译成 js 的代码

配置文件这里就直接使用一个对象来代替，loader 就拿到外面去

```javascript
const webpackConfig = {
  module: {
    rules: [
      {
        test: /\.json$/,
        use: jsonLoader,
      },
    ],
  },
};
```

// jsonLoader.js

```javascript
export default function jsonLoader(source) {
  return `export default ${JSON.stringify(source)}`;
}
```

思考一下我们应该在那个步骤来执行 loader 动作呢，很明显是在 babel 转化代码之前，修改一下 index.js

```javascript
import fs from "fs";
import parser from "@babel/parser";
import traverse from "@babel/traverse";
import path from "path";
import ejs from "ejs";
import { transformFromAst } from "babel-core";
import jsonLoader from "./jsonLoader.js";
let id = 0;

const webpackConfig = {
  module: {
    rules: [
      {
        test: /\.json$/,
        use: [jsonLoader], // 这里可以是fn，也可以是fn数组，实现链式调用
      },
    ],
  },
};

/**
 * * 创建资源
 * 1.获取文件内容
 * 2.获取以来关系
 * @param {string} filePath 入口文件路径
 * @returns {source,deps}
 */
function createAsset(filePath) {
  // 1.获取文件内容
  let source = fs.readFileSync(filePath, { encoding: "utf-8" });
  console.log("文件内容", source);

  // 初始化loader
  const loaders = webpackConfig.module.rules;
  loaders.forEach(({ test, use }) => {
    if (test.test(filePath)) {
      if (Array.isArray(use)) {
        use.reverse().forEach((fn) => {
          source = fn(source);
        });
      }
    }
  });

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
```

这就简单实现了 json 文件的一个 loader 了，这个比较简单，如果要支持 vue，那就比较复杂了。

## 增加插件机制

loader 用于转换某些类型的模块，而插件则可以用于执行范围更广的任务。包括：打包优化，资源管理，注入环境变量。

插件的实现原理是基于事件机制的，webpack 在不同的阶段会抛出不同的事件，插件编写者可以监听这些插件，webpack 会在这些事件上注入不同的对象参数，插件开发者通过操作这些对象来改变 webpack 的打包行为。

那最核心的就是事件机制了，优秀的 webpack 开发者贴心的将这部分代码抽离出来了叫做 [tapable](https://www.npmjs.com/package/tapable) 我们可以直接使用，这里还有一篇 [参考文章](https://juejin.cn/post/7040982789650382855) 比较详细

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LLM Factory 测试脚本
测试 llm_factory 是否能正确创建可用的 LLM 实例
"""
import sys
import os
import asyncio

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + '/..')

from app.agent.infra.llm_factory import get_llm


async def test_llm_factory():
    """测试LLM工厂函数"""
    print("🧪 开始测试 LLM Factory...")

    # 测试获取LLM实例
    print("\n1. 测试获取LLM实例...")
    llm = get_llm()

    if llm is None:
        print("❌ 未能创建LLM实例，请检查配置")
        return False

    print("✅ 成功创建LLM实例")
    print(f"   模型: {getattr(llm, 'model_name', 'Unknown')}")
    print(f"   基础URL: {getattr(llm, 'base_url', 'Unknown')}")

    # 测试简单的调用
    print("\n2. 测试LLM调用...")
    try:
        response = llm.invoke("你好，请简单介绍一下自己")
        print("✅ LLM调用成功")
        print(f"   回复: {response.content[:100]}...")
        return True
    except Exception as e:
        print(f"❌ LLM调用失败: {e}")
        return False


def main():
    """主函数"""
    print("=" * 50)
    print("LLM Factory 测试")
    print("=" * 50)

    try:
        result = asyncio.run(test_llm_factory())
        print("\n" + "=" * 50)
        if result:
            print("🎉 所有测试通过!")
        else:
            print("💥 测试失败!")
        print("=" * 50)
        return 0 if result else 1
    except Exception as e:
        print(f"\n💥 测试过程中发生异常: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
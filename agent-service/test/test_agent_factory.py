#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ling Agent Factory 测试脚本
测试 agent_factory 是否能正确创建可用的 Ling Agent 实例
"""
import sys
import os
import asyncio

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + '/..')

from app.agent.infra.agent_factory import create_Ling_Agent


async def test_agent_factory():
    """测试Ling Agent工厂函数"""
    print("🧪 开始测试 Ling Agent Factory...")

    # 测试获取Agent实例
    print("\n1. 测试创建Ling Agent实例...")
    agent = create_Ling_Agent()

    if agent is None:
        print("❌ 未能创建Ling Agent实例")
        return False

    print("✅ 成功创建Ling Agent实例")
    print(f"   Agent类型: {type(agent)}")

    # 测试简单的调用
    print("\n2. 测试Ling Agent调用...")
    try:
        # 创建输入消息
        inputs = {"messages": [{"role": "user", "content": "你好，请简单介绍一下自己"}]}

        # 流式调用Agent
        response_chunks = []
        for chunk in agent.stream(inputs, stream_mode="updates"):
            response_chunks.append(chunk)
            print(f"   流式响应块: {chunk}")

        print("✅ Ling Agent调用成功")
        return True
    except Exception as e:
        print(f"❌ Ling Agent调用失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """主函数"""
    print("=" * 50)
    print("Ling Agent Factory 测试")
    print("=" * 50)

    try:
        result = asyncio.run(test_agent_factory())
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